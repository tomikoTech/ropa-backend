import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { setupTestApp, loginAsAdmin, teardownTestApp } from './helpers/setup';

// F5: cotización (no afecta inventario) → convertir a venta (descuenta stock).
describe('Quotations (e2e)', () => {
  let app: INestApplication;
  let token: string;
  const suffix = Date.now();

  let variantId: string;
  let warehouseId: string;
  let quotationId: string;

  const stockOf = async (): Promise<number> => {
    const res = await request(app.getHttpServer())
      .get(`/api/inventory/stock/variant/${variantId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return res.body.reduce((sum: number, s: any) => sum + Number(s.quantity), 0);
  };

  beforeAll(async () => {
    app = await setupTestApp();
    token = await loginAsAdmin(app);

    // Habilitar el módulo de cotizaciones para el tenant.
    await request(app.getHttpServer())
      .patch('/api/store-settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ quotationsEnabled: true })
      .expect(200);

    const productRes = await request(app.getHttpServer())
      .post('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `E2E Quote Product ${suffix}`,
        basePrice: 100000,
        costPrice: 50000,
        taxRate: 19,
        variants: [{ size: '41', color: 'Café' }],
      })
      .expect(201);
    variantId = productRes.body.variants[0].id;

    const whRes = await request(app.getHttpServer())
      .post('/api/inventory/warehouses')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `E2E Quote WH ${suffix}`, code: `QT-${suffix}`, isPosLocation: true })
      .expect(201);
    warehouseId = whRes.body.id;

    await request(app.getHttpServer())
      .post('/api/inventory/adjust')
      .set('Authorization', `Bearer ${token}`)
      .send({ variantId, warehouseId, quantity: 10, movementType: 'IN', notes: 'stock' })
      .expect(201);
  }, 60000);

  afterAll(async () => {
    await teardownTestApp();
  });

  it('POST /api/quotations → creates a DRAFT quote WITHOUT touching stock', async () => {
    const before = await stockOf();

    const res = await request(app.getHttpServer())
      .post('/api/quotations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        warehouseId,
        items: [{ variantId, quantity: 3 }],
      })
      .expect(201);

    expect(res.body.status).toBe('DRAFT');
    expect(res.body.quoteNumber).toMatch(/^COT-/);
    expect(Number(res.body.total)).toBe(300000);
    quotationId = res.body.id;

    const after = await stockOf();
    expect(after).toBe(before); // stock NO cambió
  });

  it('POST /api/quotations/:id/convert → creates a sale and DEDUCTS stock', async () => {
    const before = await stockOf();

    const res = await request(app.getHttpServer())
      .post(`/api/quotations/${quotationId}/convert`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        payments: [{ method: 'EFECTIVO', amount: 300000, receivedAmount: 300000 }],
      })
      .expect(201);

    expect(res.body.sale).toBeDefined();
    expect(res.body.sale.status).toBe('COMPLETED');
    expect(res.body.quotation.status).toBe('CONVERTED');
    expect(res.body.quotation.convertedSaleId).toBe(res.body.sale.id);

    const after = await stockOf();
    expect(after).toBe(before - 3); // ahora sí bajó el stock
  });

  it('POST /api/quotations/:id/convert twice → 400 (already converted)', async () => {
    await request(app.getHttpServer())
      .post(`/api/quotations/${quotationId}/convert`)
      .set('Authorization', `Bearer ${token}`)
      .send({ payments: [{ method: 'EFECTIVO', amount: 300000 }] })
      .expect(400);
  });

  it('GET /api/quotations → lists the quotation', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/quotations')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.some((q: any) => q.id === quotationId)).toBe(true);
  });
});
