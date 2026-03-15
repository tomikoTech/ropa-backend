import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { setupTestApp, loginAsAdmin, teardownTestApp } from './helpers/setup';

describe('Returns (e2e)', () => {
  let app: INestApplication;
  let token: string;
  const uniqueSuffix = Date.now();

  // Shared state
  let _productId: string;
  let variantId: string;
  let warehouseId: string;
  let clientId: string;
  let saleId: string;
  let saleItemId: string;
  let _saleItemQuantity: number;
  let returnId: string;
  let stockBeforeReturn: number;

  beforeAll(async () => {
    app = await setupTestApp();
    token = await loginAsAdmin(app);

    // ── Create a product with 1 variant ──

    const productRes = await request(app.getHttpServer())
      .post('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `E2E Return Product ${uniqueSuffix}`,
        basePrice: 30000,
        costPrice: 15000,
        taxRate: 19,
        variants: [{ size: 'S', color: 'Rojo' }],
      })
      .expect(201);

    const product = productRes.body.data;
    _productId = product.id;
    variantId = product.variants[0].id;

    // ── Create a warehouse ──

    const warehouseRes = await request(app.getHttpServer())
      .post('/api/inventory/warehouses')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `E2E Return Warehouse ${uniqueSuffix}`,
        code: `RW-${uniqueSuffix}`,
        isPosLocation: true,
      })
      .expect(201);

    warehouseId = warehouseRes.body.data.id;

    // ── Adjust stock: add 20 units ──

    await request(app.getHttpServer())
      .post('/api/inventory/adjust')
      .set('Authorization', `Bearer ${token}`)
      .send({
        variantId,
        warehouseId,
        quantity: 20,
        movementType: 'IN',
        notes: 'E2E initial stock for returns',
      })
      .expect(201);

    // ── Create a client ──

    const clientRes = await request(app.getHttpServer())
      .post('/api/clients')
      .set('Authorization', `Bearer ${token}`)
      .send({
        firstName: `E2E ReturnClient ${uniqueSuffix}`,
        lastName: 'ReturnTest',
        documentNumber: `RET-DOC-${uniqueSuffix}`,
        phone: '3005556677',
      })
      .expect(201);

    clientId = clientRes.body.data.id;

    // ── Create a sale to return ──

    const saleRes = await request(app.getHttpServer())
      .post('/api/pos/sales')
      .set('Authorization', `Bearer ${token}`)
      .send({
        clientId,
        warehouseId,
        items: [{ variantId, quantity: 3 }],
        payments: [
          {
            method: 'EFECTIVO',
            amount: 107100, // 30000 * 3 * 1.19
            receivedAmount: 110000,
          },
        ],
      })
      .expect(201);

    const sale = saleRes.body.data;
    saleId = sale.id;
    saleItemId = sale.items[0].id;
    _saleItemQuantity = sale.items[0].quantity;

    // ── Record stock after sale (before return) ──

    const stockRes = await request(app.getHttpServer())
      .get(`/api/inventory/stock/variant/${variantId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const stocks = stockRes.body.data;
    const whStock = stocks.find((s: any) => s.warehouseId === warehouseId);
    stockBeforeReturn = whStock.quantity;
    // Should be 20 - 3 = 17
  }, 60000);

  afterAll(async () => {
    await teardownTestApp();
  });

  // ─── CREATE RETURN ───

  it('POST /api/returns → creates a return', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/returns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        saleId,
        reason: 'Producto defectuoso - E2E test',
        items: [{ saleItemId, quantity: 2 }],
      })
      .expect(201);

    const ret = res.body.data;
    expect(ret).toBeDefined();
    expect(ret.returnNumber).toBeDefined();
    expect(ret.status).toBe('COMPLETED');
    expect(Number(ret.refundAmount)).toBeGreaterThan(0);
    expect(ret.reason).toBe('Producto defectuoso - E2E test');
    expect(ret.items).toHaveLength(1);
    expect(ret.items[0].quantity).toBe(2);
    expect(ret.creditNotes).toBeDefined();
    expect(ret.creditNotes.length).toBeGreaterThanOrEqual(1);

    returnId = ret.id;
  });

  // ─── VERIFY STOCK RESTORED ───

  it('GET /api/inventory/stock/variant/:id → stock restored after return', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/inventory/stock/variant/${variantId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const stocks = res.body.data;
    const whStock = stocks.find((s: any) => s.warehouseId === warehouseId);
    expect(whStock).toBeDefined();
    // stockBeforeReturn was 17, returned 2 → should be 19
    expect(whStock.quantity).toBe(stockBeforeReturn + 2);
  });

  // ─── LIST RETURNS ───

  it('GET /api/returns → returns list including new return', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/returns')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const returns = res.body.data;
    expect(Array.isArray(returns)).toBe(true);

    const found = returns.find((r: any) => r.id === returnId);
    expect(found).toBeDefined();
    expect(found.returnNumber).toBeDefined();
    expect(found.status).toBe('COMPLETED');
  });

  // ─── RETURN DETAIL ───

  it('GET /api/returns/:id → returns full return detail with items', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/returns/${returnId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const ret = res.body.data;
    expect(ret.id).toBe(returnId);
    expect(ret.reason).toBe('Producto defectuoso - E2E test');
    expect(ret.items).toHaveLength(1);
    expect(ret.items[0].quantity).toBe(2);
    expect(ret.items[0].variant).toBeDefined();
    expect(ret.sale).toBeDefined();
    expect(ret.client).toBeDefined();
    expect(ret.creditNotes).toBeDefined();
  });

  // ─── CREDIT NOTES ───

  it('GET /api/returns/credit-notes → returns credit notes from the return', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/returns/credit-notes')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const creditNotes = res.body.data;
    expect(Array.isArray(creditNotes)).toBe(true);

    const found = creditNotes.find((cn: any) => cn.returnId === returnId);
    expect(found).toBeDefined();
    expect(found.creditNoteNumber).toBeDefined();
    expect(Number(found.amount)).toBeGreaterThan(0);
    expect(found.return).toBeDefined();
  });

  // ─── VALIDATION: RETURN MORE THAN SOLD ───

  it('POST /api/returns → rejects returning more than sold quantity', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/returns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        saleId,
        reason: 'Too many',
        items: [{ saleItemId, quantity: 999 }],
      })
      .expect(400);

    expect(res.body.statusCode).toBe(400);
    expect(res.body.message).toContain('excede');
  });

  // ─── VALIDATION: INVALID SALE ID ───

  it('POST /api/returns → rejects invalid saleId', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/returns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        saleId: '00000000-0000-0000-0000-000000000000',
        reason: 'Invalid sale',
        items: [{ saleItemId, quantity: 1 }],
      })
      .expect(404);

    expect(res.body.statusCode).toBe(404);
  });

  // ─── VALIDATION: EMPTY ITEMS ───

  it('POST /api/returns → rejects empty items array', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/returns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        saleId,
        reason: 'No items',
        items: [],
      })
      .expect(400);

    expect(res.body.statusCode).toBe(400);
  });

  // ─── RETURN NOT FOUND ───

  it('GET /api/returns/:id → 404 for non-existent return', async () => {
    await request(app.getHttpServer())
      .get('/api/returns/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });
});
