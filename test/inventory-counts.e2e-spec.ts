import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { tryLogin } from './helpers/login';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

describe('Conteo físico de inventario (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let warehouseId: string;
  let variantId: string;
  let countId: string;

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
        name: `E2E Conteo WH ${ts}`,
        code: `CT-${ts.toString().slice(-5)}`,
      });
    warehouseId = wh.body.id;

    const prod = await request(app.getHttpServer())
      .post('/api/products')
      .set(auth())
      .send({
        name: `E2E Conteo Producto ${ts}`,
        basePrice: 10000,
        costPrice: 5000,
        variants: [{ size: 'U', color: 'Negro' }],
      });
    variantId = prod.body.variants[0].id;

    // El sistema queda con 10 unidades.
    await request(app.getHttpServer())
      .post('/api/inventory/adjust')
      .set(auth())
      .send({
        variantId,
        warehouseId,
        quantity: 10,
        movementType: 'IN',
        notes: 'stock inicial conteo',
      });
  }, 90000);

  afterAll(async () => {
    await app.close();
  });

  it('abre un conteo con su consecutivo', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/inventory-counts')
      .set(auth())
      .send({ warehouseId, notes: 'Conteo E2E' })
      .expect(201);

    expect(res.body.countNumber).toMatch(/^INV-\d{5}$/);
    expect(res.body.status).toBe('OPEN');
    countId = res.body.id;
  });

  // Dos conteos abiertos a la vez sobre la misma bodega darían resultados
  // contradictorios al cerrarlos.
  it('no deja abrir dos conteos en la misma bodega', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/inventory-counts')
      .set(auth())
      .send({ warehouseId });

    expect(res.status).toBe(400);
    expect(String(res.body.message)).toMatch(/ya hay un conteo abierto/i);
  });

  // Se cuenta pasando el lector por la mercancía, no tecleando totales.
  it('acumula lo contado escaneo a escaneo', async () => {
    for (let i = 0; i < 3; i++) {
      await request(app.getHttpServer())
        .post(`/api/inventory-counts/${countId}/lines`)
        .set(auth())
        .send({ variantId })
        .expect(201);
    }
    const res = await request(app.getHttpServer())
      .post(`/api/inventory-counts/${countId}/lines`)
      .set(auth())
      .send({ variantId, quantity: 4 })
      .expect(201);

    expect(res.body.countedQuantity).toBe(7);
  });

  it('reporta la diferencia contra el sistema', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/inventory-counts/${countId}/differences`)
      .set(auth())
      .expect(200);

    const d = res.body.find(
      (x: { variantId: string }) => x.variantId === variantId,
    );
    expect(d.expected).toBe(10);
    expect(d.counted).toBe(7);
    // Negativo = faltante: es justo lo que un conteo debe sacar a la luz.
    expect(d.difference).toBe(-3);
  });

  it('al cerrar con ajuste deja el inventario igual a lo contado', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/inventory-counts/${countId}/close`)
      .set(auth())
      .send({ adjust: true })
      .expect(201);

    expect(res.body.adjusted).toBeGreaterThanOrEqual(1);

    const stock = await request(app.getHttpServer())
      .get('/api/inventory/stock')
      .set(auth())
      .expect(200);

    const fila = (stock.body.items ?? stock.body).find(
      (s: { variantId: string; warehouseId: string }) =>
        s.variantId === variantId && s.warehouseId === warehouseId,
    );
    expect(fila.quantity).toBe(7);
  });

  it('un conteo cerrado ya no admite más escaneos', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/inventory-counts/${countId}/lines`)
      .set(auth())
      .send({ variantId });

    expect(res.status).toBe(400);
    expect(String(res.body.message)).toMatch(/ya está cerrado/i);
  });

  it('tras cerrar, se puede abrir uno nuevo en la misma bodega', async () => {
    await request(app.getHttpServer())
      .post('/api/inventory-counts')
      .set(auth())
      .send({ warehouseId })
      .expect(201);
  });
});
