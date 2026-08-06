import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { setupTestApp, loginAsAdmin, teardownTestApp } from './helpers/setup';

// F6: separados. Apartar reduce el disponible; no se vende a otros; venderle al
// cliente reservado consume el apartado.
describe('Reservations / separados (e2e)', () => {
  let app: INestApplication;
  let token: string;
  const suffix = Date.now();

  let variantId: string;
  let warehouseId: string;
  let clientAId: string;

  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    app = await setupTestApp();
    token = await loginAsAdmin(app);

    await request(app.getHttpServer())
      .patch('/api/store-settings')
      .set(auth())
      .send({ reservationsEnabled: true })
      .expect(200);

    const p = await request(app.getHttpServer())
      .post('/api/products')
      .set(auth())
      .send({
        name: `E2E Resv Product ${suffix}`,
        basePrice: 50000,
        costPrice: 25000,
        taxRate: 19,
        variants: [{ size: '42', color: 'Negro' }],
      })
      .expect(201);
    variantId = p.body.variants[0].id;

    const wh = await request(app.getHttpServer())
      .post('/api/inventory/warehouses')
      .set(auth())
      .send({ name: `E2E Resv WH ${suffix}`, code: `RS-${suffix}`, isPosLocation: true })
      .expect(201);
    warehouseId = wh.body.id;

    // Stock: 2 unidades exactas.
    await request(app.getHttpServer())
      .post('/api/inventory/adjust')
      .set(auth())
      .send({ variantId, warehouseId, quantity: 2, movementType: 'IN', notes: 'stock' })
      .expect(201);

    const client = await request(app.getHttpServer())
      .post('/api/clients')
      .set(auth())
      .send({ phone: `37${suffix.toString().slice(-8)}` })
      .expect(201);
    clientAId = client.body.id;
  }, 60000);

  afterAll(async () => {
    await teardownTestApp();
  });

  let reservationId: string;

  it('POST /api/reservations → aparta 2 para el cliente A', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/reservations')
      .set(auth())
      .send({ variantId, warehouseId, quantity: 2, clientId: clientAId, note: 'Para el sábado' })
      .expect(201);
    expect(res.body.status).toBe('ACTIVE');
    reservationId = res.body.id;
  });

  it('GET /api/reservations/summary → muestra 2 apartados de la variante', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/reservations/summary')
      .set(auth())
      .expect(200);
    expect(res.body[variantId]).toBe(2);
  });

  it('vender a OTRO cliente (genérico) → 400 por apartado', async () => {
    await request(app.getHttpServer())
      .post('/api/pos/sales')
      .set(auth())
      .send({
        warehouseId,
        items: [{ variantId, quantity: 1 }],
        payments: [{ method: 'EFECTIVO', amount: 50000, receivedAmount: 50000 }],
      })
      .expect(400);
  });

  it('vender al cliente A (reservado) → 201 y consume el apartado', async () => {
    await request(app.getHttpServer())
      .post('/api/pos/sales')
      .set(auth())
      .send({
        clientId: clientAId,
        warehouseId,
        items: [{ variantId, quantity: 2 }],
        payments: [{ method: 'EFECTIVO', amount: 100000, receivedAmount: 100000 }],
      })
      .expect(201);

    // El apartado quedó consumido (ya no aparece activo).
    const res = await request(app.getHttpServer())
      .get('/api/reservations/summary')
      .set(auth())
      .expect(200);
    expect(res.body[variantId] ?? 0).toBe(0);
  });
});
