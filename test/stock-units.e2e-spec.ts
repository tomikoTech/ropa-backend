import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { tryLogin } from './helpers/login';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { isValidBarcode } from '../src/inventory/barcode.util';

describe('Recepción por cajas y apertura de bultos (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let orderId: string;
  let boxLineId: string;
  let boxIds: string[] = [];
  let warehouseId: string;

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
        name: `E2E Bulto WH ${ts}`,
        code: `BU-${ts.toString().slice(-5)}`,
      });
    warehouseId = wh.body.id;

    const sup = await request(app.getHttpServer())
      .post('/api/suppliers')
      .set(auth())
      .send({
        name: `E2E Bulto Prov ${ts}`,
        nit: `902${ts.toString().slice(-6)}-3`,
      });

    // Curva 2+2 = 4 unidades por caja (pequeña, para poder contarlas a mano).
    const sizeIds: string[] = [];
    const sizeNames = [`B40-${ts}`, `B41-${ts}`];
    for (const name of sizeNames) {
      const s = await request(app.getHttpServer())
        .post('/api/sizes')
        .set(auth())
        .send({ name });
      sizeIds.push(s.body.id);
    }
    const prod = await request(app.getHttpServer())
      .post('/api/products')
      .set(auth())
      .send({
        name: `E2E Bulto Producto ${ts}`,
        basePrice: 120000,
        costPrice: 50000,
        variants: sizeNames.map((size) => ({ size, color: 'Negro' })),
      });
    const curve = await request(app.getHttpServer())
      .post('/api/size-curves')
      .set(auth())
      .send({
        name: `Curva bulto ${ts}`,
        items: sizeIds.map((sizeId) => ({ sizeId, quantity: 2 })),
      });

    const order = await request(app.getHttpServer())
      .post('/api/purchases')
      .set(auth())
      .send({ supplierId: sup.body.id, warehouseId: wh.body.id, items: [] });
    orderId = order.body.id;

    const line = await request(app.getHttpServer())
      .post(`/api/purchases/${orderId}/box-lines`)
      .set(auth())
      .send({
        productId: prod.body.id,
        sizeCurveId: curve.body.id,
        boxes: 3,
        unitsPerBox: 4,
        unitCost: 25000,
        salePrice: 100000,
      });
    boxLineId = line.body.id;
  }, 90000);

  afterAll(async () => {
    await app.close();
  });

  it('recibe parte de las cajas y crea un bulto por caja', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/stock-units/receive/${boxLineId}`)
      .set(auth())
      .send({ boxes: 2 })
      .expect(201);

    expect(res.body).toHaveLength(2);
    expect(res.body.every((u: { kind: string }) => u.kind === 'BOX')).toBe(
      true,
    );
    // Cada caja "contiene" sus unidades: es lo que la hace vendible como bulto.
    expect(res.body.every((u: { quantity: number }) => u.quantity === 4)).toBe(
      true,
    );
    boxIds = res.body.map((u: { id: string }) => u.id);
  });

  it('los códigos son válidos y no se repiten', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/stock-units?boxLineId=${boxLineId}`)
      .set(auth())
      .expect(200);

    const codes = res.body.map((u: { barcode: string }) => u.barcode);
    expect(new Set(codes).size).toBe(codes.length);
    // El dígito verificador es lo que permite al lector descartar una mala
    // lectura; si no cuadra, la etiqueta no sirve.
    expect(codes.every((c: string) => isValidBarcode(c))).toBe(true);
  });

  it('no deja recibir más cajas de las pendientes', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/stock-units/receive/${boxLineId}`)
      .set(auth())
      .send({ boxes: 5 });

    expect(res.status).toBe(400);
    expect(String(res.body.message)).toMatch(/quedan 1 caja/i);
  });

  it('recibe el resto y deja el renglón completo', async () => {
    await request(app.getHttpServer())
      .post(`/api/stock-units/receive/${boxLineId}`)
      .set(auth())
      .send({})
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/api/purchases/${orderId}/box-lines`)
      .set(auth())
      .expect(200);

    expect(res.body[0].boxesReceived).toBe(3);
  });

  it('avisa cuando ya no queda nada por recibir', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/stock-units/receive/${boxLineId}`)
      .set(auth())
      .send({});

    expect(res.status).toBe(400);
    expect(String(res.body.message)).toMatch(/no hay cajas pendientes/i);
  });

  it('encuentra un bulto por su código de barras', async () => {
    const list = await request(app.getHttpServer())
      .get(`/api/stock-units?boxLineId=${boxLineId}`)
      .set(auth());
    const code = list.body[0].barcode;

    const res = await request(app.getHttpServer())
      .get(`/api/stock-units/by-barcode/${code}`)
      .set(auth())
      .expect(200);

    expect(res.body.barcode).toBe(code);
  });

  it('abre una caja y crea una unidad por par de la curva', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/stock-units/${boxIds[0]}/split`)
      .set(auth())
      .expect(201);

    // La curva reparte 2+2, así que salen 4 unidades.
    expect(res.body.units).toHaveLength(4);
    expect(
      res.body.units.every((u: { kind: string }) => u.kind === 'UNIT'),
    ).toBe(true);
    // Cada unidad queda con su talla; la caja no tenía ninguna.
    expect(
      res.body.units.every((u: { sizeId: string | null }) => u.sizeId),
    ).toBe(true);
    expect(
      res.body.units.every((u: { variantId: string | null }) => u.variantId),
    ).toBe(true);
    // La caja no se borra: queda marcada como abierta para no perder la
    // trazabilidad del código ya impreso.
    expect(res.body.parent.status).toBe('SPLIT');
  });

  // Regresión: la secuencia de las unidades debe continuar después de la de
  // las cajas. Si empezara en 1, la primera unidad tendría el mismo código
  // que la primera caja.
  it('las unidades no repiten el código de ninguna caja', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/stock-units?boxLineId=${boxLineId}`)
      .set(auth())
      .expect(200);

    const codes = res.body.map((u: { barcode: string }) => u.barcode);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.every((c: string) => isValidBarcode(c))).toBe(true);
    // 3 cajas + 4 unidades de la que se abrió.
    expect(codes).toHaveLength(7);
  });

  it('no deja abrir dos veces la misma caja', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/stock-units/${boxIds[0]}/split`)
      .set(auth());

    expect(res.status).toBe(400);
    expect(String(res.body.message)).toMatch(/en inventario/i);
  });

  it('no deja abrir una unidad suelta', async () => {
    const list = await request(app.getHttpServer())
      .get(`/api/stock-units?boxLineId=${boxLineId}`)
      .set(auth());
    const unit = list.body.find((u: { kind: string }) => u.kind === 'UNIT');

    const res = await request(app.getHttpServer())
      .post(`/api/stock-units/${unit.id}/split`)
      .set(auth());

    expect(res.status).toBe(400);
    expect(String(res.body.message)).toMatch(/solo se pueden abrir cajas/i);
  });

  it('una unidad salida de la caja se puede escanear y vender por su talla real', async () => {
    const list = await request(app.getHttpServer())
      .get(`/api/stock-units?boxLineId=${boxLineId}`)
      .set(auth());
    const unit = list.body.find((u: { kind: string }) => u.kind === 'UNIT');

    const scan = await request(app.getHttpServer())
      .get(`/api/pos/scan/${unit.barcode}`)
      .set(auth())
      .expect(200);

    expect(scan.body.kind).toBe('UNIT');
    expect(scan.body.variantId).toBe(unit.variantId);
    expect(scan.body.quantity).toBe(1);
    expect(scan.body.suggestedPrice).toBe(100000);

    await request(app.getHttpServer())
      .post('/api/pos/sales')
      .set(auth())
      .send({
        warehouseId,
        items: [
          {
            variantId: scan.body.variantId,
            stockUnitId: unit.id,
            quantity: 1,
            unitPrice: scan.body.suggestedPrice,
          },
        ],
        payments: [{ method: 'EFECTIVO', amount: 100000 }],
      })
      .expect(201);
  });

  it('genera las etiquetas en ZPL, una por bulto', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/labels/zpl')
      .set(auth())
      .send({ ids: boxIds })
      .expect(201);

    const zpl = res.text;
    expect(zpl.match(/\^XA/g)).toHaveLength(boxIds.length);
    expect(zpl).toContain('^CI28'); // UTF-8, para los acentos
    // Las cajas se rotulan con lo que contienen: el bodeguero lo lee sin abrir.
    expect(zpl).toContain('CAJA x4');
  });

  it('genera las etiquetas en PDF', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/labels/pdf')
      .set(auth())
      .send({ ids: boxIds })
      .expect(201);

    expect(res.headers['content-type']).toContain('application/pdf');
    // Un PDF real empieza con la cabecera %PDF.
    expect(res.body.slice(0, 4).toString()).toBe('%PDF');
  });

  // ── Venta por caja (Fase 5) ──

  it('al escanear una caja devuelve todo su contenido como una sola línea', async () => {
    const list = await request(app.getHttpServer())
      .get(`/api/stock-units?boxLineId=${boxLineId}`)
      .set(auth());
    const box = list.body.find(
      (u: { kind: string; status: string }) =>
        u.kind === 'BOX' && u.status === 'IN_STOCK',
    );

    const res = await request(app.getHttpServer())
      .get(`/api/pos/scan/${box.barcode}`)
      .set(auth())
      .expect(200);

    expect(res.body.source).toBe('STOCK_UNIT');
    expect(res.body.kind).toBe('BOX');
    // Un escaneo arrastra las 4 unidades: es lo que la hace vendible a granel.
    expect(res.body.quantity).toBe(4);
    expect(res.body.stockUnitId).toBe(box.id);
    expect(res.body.variantId).toBeTruthy();
    expect(res.body.warehouseId).toBe(warehouseId);
    expect(res.body.suggestedPrice).toBe(400000);

    // El servidor no permite vender una parte y marcar todo el bulto como
    // vendido: esa inconsistencia antes era posible llamando la API a mano.
    const partial = await request(app.getHttpServer())
      .post('/api/pos/sales')
      .set(auth())
      .send({
        warehouseId,
        items: [
          {
            variantId: res.body.variantId,
            stockUnitId: box.id,
            quantity: 1,
          },
        ],
        payments: [{ method: 'EFECTIVO', amount: 500000 }],
      });
    expect(partial.status).toBe(400);
    expect(String(partial.body.message)).toMatch(/se vende completo/i);

    await request(app.getHttpServer())
      .post('/api/pos/sales')
      .set(auth())
      .send({
        warehouseId,
        items: [
          {
            variantId: res.body.variantId,
            stockUnitId: box.id,
            quantity: res.body.quantity,
            unitPrice: res.body.suggestedPrice / res.body.quantity,
          },
        ],
        payments: [{ method: 'EFECTIVO', amount: 500000 }],
      })
      .expect(201);
  });

  it('explica por qué una caja ya abierta no se puede vender', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/stock-units?boxLineId=${boxLineId}`)
      .set(auth());
    const abierta = res.body.find(
      (u: { status: string }) => u.status === 'SPLIT',
    );

    const scan = await request(app.getHttpServer())
      .get(`/api/pos/scan/${abierta.barcode}`)
      .set(auth());

    expect(scan.status).toBe(404);
    expect(String(scan.body.message)).toMatch(/ya se abrió/i);
  });

  it('avisa cuando el código no corresponde a nada', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/pos/scan/00000000000000000')
      .set(auth());

    expect(res.status).toBe(404);
    expect(String(res.body.message)).toMatch(/no se encontró/i);
  });

  it('registra qué etiquetas se imprimieron', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/stock-units/mark-printed')
      .set(auth())
      .send({ ids: boxIds })
      .expect(201);

    expect(res.body.count).toBe(boxIds.length);
  });
});
