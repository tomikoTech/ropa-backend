import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { setupTestApp, loginAsAdmin, teardownTestApp } from './helpers/setup';

// F2: puntas + comisiones por vendedor. Override manual + snapshot + reporte.
describe('Leftover commissions (e2e)', () => {
  let app: INestApplication;
  let token: string;
  const suffix = Date.now();

  let puntaVariantId: string;
  let puntaProductId: string;
  let normalVariantId: string;
  let warehouseId: string;

  const auth = () => ({ Authorization: `Bearer ${token}` });
  const monthRange = () => {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
    return { from, to };
  };

  beforeAll(async () => {
    app = await setupTestApp();
    token = await loginAsAdmin(app);

    // Producto marcado manualmente como punta.
    const punta = await request(app.getHttpServer())
      .post('/api/products')
      .set(auth())
      .send({
        name: `E2E Punta ${suffix}`,
        basePrice: 100000,
        costPrice: 50000,
        taxRate: 19,
        variants: [{ size: '40', color: 'Negro' }],
      })
      .expect(201);
    puntaProductId = punta.body.id;
    puntaVariantId = punta.body.variants[0].id;

    // Producto normal (no punta).
    const normal = await request(app.getHttpServer())
      .post('/api/products')
      .set(auth())
      .send({
        name: `E2E Normal ${suffix}`,
        basePrice: 80000,
        costPrice: 40000,
        taxRate: 19,
        variants: [{ size: '41', color: 'Azul' }],
      })
      .expect(201);
    normalVariantId = normal.body.variants[0].id;

    const wh = await request(app.getHttpServer())
      .post('/api/inventory/warehouses')
      .set(auth())
      .send({ name: `E2E Com WH ${suffix}`, code: `CM-${suffix}`, isPosLocation: true })
      .expect(201);
    warehouseId = wh.body.id;

    for (const v of [puntaVariantId, normalVariantId]) {
      await request(app.getHttpServer())
        .post('/api/inventory/adjust')
        .set(auth())
        .send({ variantId: v, warehouseId, quantity: 10, movementType: 'IN', notes: 'stock' })
        .expect(201);
    }

    // Marcar el producto punta manualmente (override).
    await request(app.getHttpServer())
      .patch(`/api/products/${puntaProductId}`)
      .set(auth())
      .send({ isLeftover: true })
      .expect(200);
  }, 60000);

  afterAll(async () => {
    // Restaurar flags para no contaminar otras suites.
    await request(app.getHttpServer())
      .patch('/api/store-settings')
      .set(auth())
      .send({ leftoverCommissionEnabled: false })
      .catch(() => {});
    await teardownTestApp();
  });

  it('con comisión OFF → la venta no genera comisión', async () => {
    await request(app.getHttpServer())
      .patch('/api/store-settings')
      .set(auth())
      .send({ leftoverCommissionEnabled: false })
      .expect(200);

    const sale = await request(app.getHttpServer())
      .post('/api/pos/sales')
      .set(auth())
      .send({
        warehouseId,
        items: [{ variantId: puntaVariantId, quantity: 1 }],
        payments: [{ method: 'EFECTIVO', amount: 100000, receivedAmount: 100000 }],
      })
      .expect(201);
    expect(Number(sale.body.items[0].commissionAmount ?? 0)).toBe(0);
    expect(sale.body.items[0].isLeftover).toBe(false);
  });

  it('con comisión ON (fijo $3000/par) → vender la punta genera comisión', async () => {
    await request(app.getHttpServer())
      .patch('/api/store-settings')
      .set(auth())
      .send({
        leftoverCommissionEnabled: true,
        leftoverCommissionMode: 'fixed',
        leftoverCommissionValue: 3000,
      })
      .expect(200);

    // Vender 2 pares de la punta.
    const sale = await request(app.getHttpServer())
      .post('/api/pos/sales')
      .set(auth())
      .send({
        warehouseId,
        items: [{ variantId: puntaVariantId, quantity: 2 }],
        payments: [{ method: 'EFECTIVO', amount: 200000, receivedAmount: 200000 }],
      })
      .expect(201);
    expect(sale.body.items[0].isLeftover).toBe(true);
    expect(Number(sale.body.items[0].commissionAmount)).toBe(6000); // 3000 * 2

    // Vender el producto normal → sin comisión.
    const normalSale = await request(app.getHttpServer())
      .post('/api/pos/sales')
      .set(auth())
      .send({
        warehouseId,
        items: [{ variantId: normalVariantId, quantity: 1 }],
        payments: [{ method: 'EFECTIVO', amount: 80000, receivedAmount: 80000 }],
      })
      .expect(201);
    expect(normalSale.body.items[0].isLeftover).toBe(false);
    expect(Number(normalSale.body.items[0].commissionAmount)).toBe(0);
  });

  it('GET /reports/commissions agrupa la comisión por vendedor', async () => {
    const { from, to } = monthRange();
    const res = await request(app.getHttpServer())
      .get(`/api/reports/commissions?from=${from}&to=${to}`)
      .set(auth())
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    const total = res.body.reduce((s: number, r: any) => s + Number(r.comisionTotal), 0);
    expect(total).toBeGreaterThanOrEqual(6000);
    const anyRow = res.body[0];
    expect(anyRow).toHaveProperty('sellerName');
    expect(anyRow).toHaveProperty('unidades');
  });
});
