import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { setupTestApp, loginAsAdmin, teardownTestApp } from './helpers/setup';

// P1f: GET /inventory/stock/summary-by-product suma el stock por producto.
describe('Stock summary by product (e2e)', () => {
  let app: INestApplication;
  let token: string;
  const suffix = Date.now();
  let productId: string;
  let variantId: string;

  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    app = await setupTestApp();
    token = await loginAsAdmin(app);

    const p = await request(app.getHttpServer())
      .post('/api/products')
      .set(auth())
      .send({
        name: `E2E Summary ${suffix}`,
        basePrice: 50000,
        costPrice: 25000,
        taxRate: 19,
        variants: [{ size: '40', color: 'Negro' }],
      })
      .expect(201);
    productId = p.body.id;
    variantId = p.body.variants[0].id;

    // Stock en 2 bodegas: 3 + 4 = 7.
    for (const [qty, n] of [[3, 'A'], [4, 'B']] as const) {
      const wh = await request(app.getHttpServer())
        .post('/api/inventory/warehouses')
        .set(auth())
        .send({ name: `E2E Sum WH ${n} ${suffix}`, code: `SUM${n}-${suffix}`, isPosLocation: true })
        .expect(201);
      await request(app.getHttpServer())
        .post('/api/inventory/adjust')
        .set(auth())
        .send({ variantId, warehouseId: wh.body.id, quantity: qty, movementType: 'IN', notes: 'stock' })
        .expect(201);
    }
  }, 60000);

  afterAll(async () => {
    await teardownTestApp();
  });

  it('GET /inventory/stock/summary-by-product → suma total por producto', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/inventory/stock/summary-by-product')
      .set(auth())
      .expect(200);
    expect(res.body[productId]).toBe(7);
  });
});
