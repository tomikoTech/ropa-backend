import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { tryLogin } from './helpers/login';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

describe('Compra por cajas y costeo de importación (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let orderId: string;
  let productId: string;
  let colorId: string;
  let curveId: string;
  let lineId: string;

  const ts = Date.now();
  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    token = await tryLogin(app);

    const wh = await request(app.getHttpServer())
      .post('/api/inventory/warehouses')
      .set(auth())
      .send({
        name: `E2E Caja WH ${ts}`,
        code: `CJ-${ts.toString().slice(-5)}`,
      });

    const sup = await request(app.getHttpServer())
      .post('/api/suppliers')
      .set(auth())
      .send({
        name: `E2E Caja Prov ${ts}`,
        nit: `901${ts.toString().slice(-6)}-2`,
      });

    const prod = await request(app.getHttpServer())
      .post('/api/products')
      .set(auth())
      .send({
        name: `E2E Caja Producto ${ts}`,
        basePrice: 90000,
        costPrice: 40000,
        variants: [{ size: 'U', color: 'Negro' }],
      });
    productId = prod.body.id;

    const color = await request(app.getHttpServer())
      .post('/api/colors')
      .set(auth())
      .send({ name: `CajaColor ${ts}` });
    colorId = color.body.id;

    // Curva 6+6 = 12 unidades por caja.
    const sizeIds: string[] = [];
    for (const name of [`K40-${ts}`, `K41-${ts}`]) {
      const s = await request(app.getHttpServer())
        .post('/api/sizes')
        .set(auth())
        .send({ name });
      sizeIds.push(s.body.id);
    }
    const curve = await request(app.getHttpServer())
      .post('/api/size-curves')
      .set(auth())
      .send({
        name: `Curva caja ${ts}`,
        items: sizeIds.map((sizeId) => ({ sizeId, quantity: 6 })),
      });
    curveId = curve.body.id;

    const order = await request(app.getHttpServer())
      .post('/api/purchases')
      .set(auth())
      .send({
        supplierId: sup.body.id,
        warehouseId: wh.body.id,
        items: [],
      });
    orderId = order.body.id;
  }, 90000);

  afterAll(async () => {
    await app.close();
  });

  it('agrega un renglón por cajas con su curva', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/purchases/${orderId}/box-lines`)
      .set(auth())
      .send({
        productId,
        colorId,
        sizeCurveId: curveId,
        boxes: 10,
        unitsPerBox: 12,
        unitCost: 10,
        salePrice: 90000,
      })
      .expect(201);

    expect(res.body.boxes).toBe(10);
    expect(res.body.unitsPerBox).toBe(12);
    expect(res.body.consecutive).toBe(1);
    lineId = res.body.id;
  });

  // Si la caja dice 24 pero la curva reparte 12, el detallado dejaría
  // unidades sin talla. Es la validación que en el sistema anterior solo
  // existía como aviso en pantalla.
  it('rechaza una curva que no cuadra con las unidades por caja', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/purchases/${orderId}/box-lines`)
      .set(auth())
      .send({
        productId,
        sizeCurveId: curveId,
        boxes: 1,
        unitsPerBox: 24,
        unitCost: 10,
      });

    expect(res.status).toBe(400);
    expect(String(res.body.message)).toMatch(/reparte 12 unidades/i);
  });

  it('el correlativo avanza y no reutiliza números', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/purchases/${orderId}/box-lines`)
      .set(auth())
      .send({ productId, boxes: 2, unitsPerBox: 5, unitCost: 20 })
      .expect(201);

    expect(res.body.consecutive).toBe(2);
  });

  it('guarda tasa de cambio y fletes con su concepto', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/purchases/${orderId}/import-costs`)
      .set(auth())
      .send({
        exchangeRate: 4000,
        freightCosts: [
          { label: 'Naviera', amount: 1_000_000 },
          { label: 'Aduana', amount: 300_000 },
        ],
        arrivalDate: '2026-09-15',
      })
      .expect(200);

    expect(Number(res.body.exchangeRate)).toBe(4000);
    expect(res.body.freightCosts).toHaveLength(2);
  });

  it('calcula el costo puesto en bodega repartiendo el flete por unidades', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/purchases/${orderId}/landed-cost`)
      .set(auth())
      .expect(200);

    // Línea 1: 10 cajas x 12 = 120 u.  Línea 2: 2 x 5 = 10 u.  Total 130.
    expect(res.body.totalUnits).toBe(130);
    expect(res.body.freightTotal).toBe(1_300_000);

    // Mercancía: 120 x (10 x 4000) + 10 x (20 x 4000) = 4.800.000 + 800.000
    expect(res.body.goodsTotal).toBe(5_600_000);
    expect(res.body.landedTotal).toBe(6_900_000);

    // Flete por unidad = 1.300.000 / 130 = 10.000
    const l1 = res.body.lines.find((l: { units: number }) => l.units === 120);
    expect(l1.freightShare).toBe(1_200_000);
    expect(l1.landedUnitCost).toBe(50_000); // 40.000 + 10.000
  });

  it('el flete repartido suma exactamente el flete pagado', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/purchases/${orderId}/landed-cost`)
      .set(auth())
      .expect(200);

    const suma = res.body.lines.reduce(
      (s: number, l: { freightShare: number }) => s + l.freightShare,
      0,
    );
    expect(Math.round(suma)).toBe(res.body.freightTotal);
  });

  it('lista los renglones en orden de correlativo', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/purchases/${orderId}/box-lines`)
      .set(auth())
      .expect(200);

    expect(res.body.map((l: { consecutive: number }) => l.consecutive)).toEqual(
      [1, 2],
    );
  });

  it('actualiza un renglón no recibido', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/purchases/box-lines/${lineId}`)
      .set(auth())
      .send({ boxes: 12 })
      .expect(200);

    expect(res.body.boxes).toBe(12);
  });

  it('rechaza un producto de otro tenant', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/purchases/${orderId}/box-lines`)
      .set(auth())
      .send({
        productId: '00000000-0000-0000-0000-000000000000',
        boxes: 1,
        unitsPerBox: 1,
        unitCost: 1,
      });

    expect(res.status).toBe(404);
  });

  it('elimina un renglón no recibido', async () => {
    await request(app.getHttpServer())
      .delete(`/api/purchases/box-lines/${lineId}`)
      .set(auth())
      .expect(200);

    const res = await request(app.getHttpServer())
      .get(`/api/purchases/${orderId}/box-lines`)
      .set(auth())
      .expect(200);

    expect(res.body).toHaveLength(1);
  });
});
