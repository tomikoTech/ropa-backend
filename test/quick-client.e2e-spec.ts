import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { setupTestApp, loginAsAdmin, teardownTestApp } from './helpers/setup';

// F1: cliente rápido por celular + buscar venta por teléfono.
describe('Quick client by phone + find sale by phone (e2e)', () => {
  let app: INestApplication;
  let token: string;
  const suffix = Date.now();
  const phone = `30${suffix.toString().slice(-8)}`; // teléfono único

  let variantId: string;
  let warehouseId: string;
  let clientId: string;

  beforeAll(async () => {
    app = await setupTestApp();
    token = await loginAsAdmin(app);

    const productRes = await request(app.getHttpServer())
      .post('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `E2E QuickClient Product ${suffix}`,
        basePrice: 40000,
        costPrice: 20000,
        taxRate: 19,
        variants: [{ size: '40', color: 'Negro' }],
      })
      .expect(201);
    variantId = productRes.body.variants[0].id;

    const whRes = await request(app.getHttpServer())
      .post('/api/inventory/warehouses')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `E2E QC WH ${suffix}`, code: `QC-${suffix}`, isPosLocation: true })
      .expect(201);
    warehouseId = whRes.body.id;

    await request(app.getHttpServer())
      .post('/api/inventory/adjust')
      .set('Authorization', `Bearer ${token}`)
      .send({ variantId, warehouseId, quantity: 5, movementType: 'IN', notes: 'stock' })
      .expect(201);
  }, 60000);

  afterAll(async () => {
    await teardownTestApp();
  });

  it('POST /api/clients with ONLY phone → creates client, name filled from phone', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/clients')
      .set('Authorization', `Bearer ${token}`)
      .send({ phone })
      .expect(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.phone).toBe(phone);
    expect(res.body.firstName).toBe(phone);
    clientId = res.body.id;
  });

  it('POST /api/clients with no identifier → 400', async () => {
    await request(app.getHttpServer())
      .post('/api/clients')
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(400);
  });

  it('POST /api/pos/sales for the quick client → 201', async () => {
    await request(app.getHttpServer())
      .post('/api/pos/sales')
      .set('Authorization', `Bearer ${token}`)
      .send({
        clientId,
        warehouseId,
        items: [{ variantId, quantity: 1 }],
        payments: [{ method: 'EFECTIVO', amount: 40000, receivedAmount: 40000 }],
      })
      .expect(201);
  });

  it('GET /api/pos/sales?clientPhone= → finds the sale by phone', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/pos/sales?clientPhone=${phone.slice(-6)}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    const found = res.body.find((s: any) => s.client?.phone === phone);
    expect(found).toBeDefined();
  });

  it('GET /api/pos/sales?clientPhone=<inexistente> → empty', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/pos/sales?clientPhone=000000000000')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.every((s: any) => s.client?.phone !== phone)).toBe(true);
  });
});
