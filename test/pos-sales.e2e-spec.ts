import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { setupTestApp, loginAsAdmin, teardownTestApp } from './helpers/setup';

describe('POS Sales & Accounts Receivable (e2e)', () => {
  let app: INestApplication;
  let token: string;
  const uniqueSuffix = Date.now();

  // Shared state across tests
  let _productId: string;
  let variant1Id: string;
  let variant2Id: string;
  let warehouseId: string;
  let clientId: string;
  let cashSaleId: string;
  let _cashSaleTotal: number;
  let _cashSaleItemId: string;
  let creditSaleId: string;
  let arId: string;
  let arTotalAmount: number;

  beforeAll(async () => {
    app = await setupTestApp();
    token = await loginAsAdmin(app);

    // ── Create a product with 2 variants ──

    const productRes = await request(app.getHttpServer())
      .post('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `E2E Sale Product ${uniqueSuffix}`,
        basePrice: 50000,
        costPrice: 25000,
        taxRate: 19,
        variants: [
          { size: 'M', color: 'Negro' },
          { size: 'L', color: 'Blanco' },
        ],
      })
      .expect(201);

    const product = productRes.body.data;
    _productId = product.id;
    variant1Id = product.variants[0].id;
    variant2Id = product.variants[1].id;

    // ── Create a warehouse ──

    const warehouseRes = await request(app.getHttpServer())
      .post('/api/inventory/warehouses')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `E2E Warehouse ${uniqueSuffix}`,
        code: `WH-${uniqueSuffix}`,
        isPosLocation: true,
      })
      .expect(201);

    warehouseId = warehouseRes.body.data.id;

    // ── Adjust stock: add 10 units of each variant ──

    await request(app.getHttpServer())
      .post('/api/inventory/adjust')
      .set('Authorization', `Bearer ${token}`)
      .send({
        variantId: variant1Id,
        warehouseId,
        quantity: 10,
        movementType: 'IN',
        notes: 'E2E initial stock variant 1',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/inventory/adjust')
      .set('Authorization', `Bearer ${token}`)
      .send({
        variantId: variant2Id,
        warehouseId,
        quantity: 10,
        movementType: 'IN',
        notes: 'E2E initial stock variant 2',
      })
      .expect(201);

    // ── Create a client for sales ──

    const clientRes = await request(app.getHttpServer())
      .post('/api/clients')
      .set('Authorization', `Bearer ${token}`)
      .send({
        firstName: `E2E SaleClient ${uniqueSuffix}`,
        lastName: 'SaleTest',
        documentNumber: `SALE-DOC-${uniqueSuffix}`,
        phone: '3001112233',
      })
      .expect(201);

    clientId = clientRes.body.data.id;
  }, 60000);

  afterAll(async () => {
    await teardownTestApp();
  });

  // ─── CASH SALE ───

  it('POST /api/pos/sales → creates a cash sale', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/pos/sales')
      .set('Authorization', `Bearer ${token}`)
      .send({
        clientId,
        warehouseId,
        items: [{ variantId: variant1Id, quantity: 2 }],
        payments: [
          {
            method: 'EFECTIVO',
            amount: 119000,
            receivedAmount: 120000,
          },
        ],
      })
      .expect(201);

    const sale = res.body.data;
    expect(sale).toBeDefined();
    expect(sale.saleNumber).toBeDefined();
    expect(sale.status).toBe('COMPLETED');
    expect(sale.items).toHaveLength(1);
    expect(sale.items[0].quantity).toBe(2);
    expect(sale.payments).toHaveLength(1);
    expect(sale.payments[0].method).toBe('EFECTIVO');
    expect(Number(sale.total)).toBeGreaterThan(0);

    cashSaleId = sale.id;
    _cashSaleTotal = Number(sale.total);
    _cashSaleItemId = sale.items[0].id;
  });

  // ─── VERIFY STOCK DECREASED ───

  it('GET /api/inventory/stock/variant/:id → stock decreased after sale', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/inventory/stock/variant/${variant1Id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const stocks = res.body.data;
    expect(Array.isArray(stocks)).toBe(true);

    const warehouseStock = stocks.find(
      (s: any) => s.warehouseId === warehouseId,
    );
    expect(warehouseStock).toBeDefined();
    // Started with 10, sold 2 → should be 8
    expect(warehouseStock.quantity).toBe(8);
  });

  // ─── CREDIT SALE ───

  it('POST /api/pos/sales → creates a credit sale', async () => {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);

    const res = await request(app.getHttpServer())
      .post('/api/pos/sales')
      .set('Authorization', `Bearer ${token}`)
      .send({
        clientId,
        warehouseId,
        items: [{ variantId: variant2Id, quantity: 1 }],
        payments: [
          {
            method: 'CREDITO',
            amount: 59500,
          },
        ],
        creditDueDate: dueDate.toISOString().split('T')[0],
        creditNotes: 'E2E credit sale test',
      })
      .expect(201);

    const sale = res.body.data;
    expect(sale).toBeDefined();
    expect(sale.saleNumber).toBeDefined();
    expect(sale.status).toBe('COMPLETED');
    expect(Number(sale.total)).toBeGreaterThan(0);

    creditSaleId = sale.id;
  });

  // ─── LIST SALES ───

  it('GET /api/pos/sales → returns sales list', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/pos/sales')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const sales = res.body.data;
    expect(Array.isArray(sales)).toBe(true);
    expect(sales.length).toBeGreaterThanOrEqual(2);

    const cashSale = sales.find((s: any) => s.id === cashSaleId);
    expect(cashSale).toBeDefined();

    const creditSale = sales.find((s: any) => s.id === creditSaleId);
    expect(creditSale).toBeDefined();
  });

  // ─── GET SALE DETAIL ───

  it('GET /api/pos/sales/:id → returns sale detail', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/pos/sales/${cashSaleId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const sale = res.body.data;
    expect(sale.id).toBe(cashSaleId);
    expect(sale.items).toHaveLength(1);
    expect(sale.payments).toHaveLength(1);
    expect(sale.client).toBeDefined();
    expect(sale.warehouse).toBeDefined();
  });

  // ─── ACCOUNTS RECEIVABLE ───

  it('GET /api/pos/accounts-receivable → returns the credit sale AR entry', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/pos/accounts-receivable')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const arList = res.body.data;
    expect(Array.isArray(arList)).toBe(true);

    const ar = arList.find((a: any) => a.saleId === creditSaleId);
    expect(ar).toBeDefined();
    expect(ar.isFullyPaid).toBe(false);
    expect(Number(ar.paidAmount)).toBe(0);
    expect(Number(ar.totalAmount)).toBeGreaterThan(0);

    arId = ar.id;
    arTotalAmount = Number(ar.totalAmount);
  });

  // ─── PARTIAL PAYMENT (ABONO) ───

  it('POST /api/pos/accounts-receivable/:id/payment → records partial payment', async () => {
    const halfAmount = Math.round((arTotalAmount / 2) * 100) / 100;

    const res = await request(app.getHttpServer())
      .post(`/api/pos/accounts-receivable/${arId}/payment`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        amount: halfAmount,
        method: 'EFECTIVO',
      })
      .expect(201);

    const ar = res.body.data;
    expect(ar).toBeDefined();
    expect(Number(ar.paidAmount)).toBeCloseTo(halfAmount, 0);
    expect(ar.isFullyPaid).toBe(false);
  });

  // ─── VERIFY PARTIAL PAYMENT ───

  it('GET /api/pos/accounts-receivable/:id → verify paidAmount updated, isFullyPaid false', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/pos/accounts-receivable/${arId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const ar = res.body.data;
    expect(ar.isFullyPaid).toBe(false);
    expect(Number(ar.paidAmount)).toBeGreaterThan(0);
    expect(Number(ar.paidAmount)).toBeLessThan(arTotalAmount);
    expect(ar.payments).toBeDefined();
    expect(ar.payments.length).toBe(1);
  });

  // ─── PAY REMAINING ───

  it('POST /api/pos/accounts-receivable/:id/payment → pay remaining balance', async () => {
    const halfAmount = Math.round((arTotalAmount / 2) * 100) / 100;
    const remaining = arTotalAmount - halfAmount;

    const res = await request(app.getHttpServer())
      .post(`/api/pos/accounts-receivable/${arId}/payment`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        amount: remaining,
        method: 'TRANSFERENCIA',
        reference: 'REF-E2E-PAYMENT',
      })
      .expect(201);

    const ar = res.body.data;
    expect(ar).toBeDefined();
    expect(ar.isFullyPaid).toBe(true);
  });

  // ─── VERIFY FULLY PAID ───

  it('GET /api/pos/accounts-receivable/:id → verify isFullyPaid true', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/pos/accounts-receivable/${arId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const ar = res.body.data;
    expect(ar.isFullyPaid).toBe(true);
    expect(Number(ar.paidAmount)).toBeCloseTo(arTotalAmount, 0);
    expect(ar.payments.length).toBe(2);
  });

  // ─── FILTER ACCOUNTS RECEIVABLE ───

  it('GET /api/pos/accounts-receivable?isFullyPaid=false → filters unpaid', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/pos/accounts-receivable?isFullyPaid=false')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const arList = res.body.data;
    // Our AR is now fully paid, so it should NOT be in this list
    const found = arList.find((a: any) => a.id === arId);
    expect(found).toBeUndefined();
  });

  // ─── CLIENT ACCOUNT SUMMARY ───

  it('GET /api/pos/clients/:clientId/account-summary → returns summary', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/pos/clients/${clientId}/account-summary`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const summary = res.body.data;
    expect(summary).toBeDefined();
    expect(typeof summary.totalCredit).toBe('number');
    expect(typeof summary.totalPaid).toBe('number');
    expect(typeof summary.totalPending).toBe('number');
    expect(typeof summary.activeAccounts).toBe('number');
    // Our account is fully paid
    expect(summary.totalPending).toBe(0);
    expect(summary.activeAccounts).toBe(0);
  });

  // ─── VALIDATION: INSUFFICIENT STOCK ───

  it('POST /api/pos/sales → rejects sale with insufficient stock', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/pos/sales')
      .set('Authorization', `Bearer ${token}`)
      .send({
        clientId,
        warehouseId,
        items: [{ variantId: variant1Id, quantity: 999 }],
        payments: [{ method: 'EFECTIVO', amount: 999999999 }],
      })
      .expect(400);

    expect(res.body.statusCode).toBe(400);
    expect(res.body.message).toContain('Stock insuficiente');
  });

  // ─── VALIDATION: CREDIT SALE WITHOUT CLIENT ───

  it('POST /api/pos/sales → rejects credit sale without real client', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/pos/sales')
      .set('Authorization', `Bearer ${token}`)
      .send({
        warehouseId,
        items: [{ variantId: variant2Id, quantity: 1 }],
        payments: [{ method: 'CREDITO', amount: 59500 }],
        creditDueDate: '2026-12-31',
      })
      .expect(400);

    expect(res.body.statusCode).toBe(400);
  });

  // ─── VALIDATION: CREDIT SALE WITHOUT DUE DATE ───

  it('POST /api/pos/sales → rejects credit sale without due date', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/pos/sales')
      .set('Authorization', `Bearer ${token}`)
      .send({
        clientId,
        warehouseId,
        items: [{ variantId: variant2Id, quantity: 1 }],
        payments: [{ method: 'CREDITO', amount: 59500 }],
      })
      .expect(400);

    expect(res.body.statusCode).toBe(400);
  });

  // ─── DAILY SUMMARY ───

  it('GET /api/pos/sales/daily-summary → returns today summary', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/pos/sales/daily-summary')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const summary = res.body.data;
    expect(typeof summary.totalSales).toBe('number');
    expect(typeof summary.totalAmount).toBe('number');
    expect(typeof summary.totalItems).toBe('number');
    expect(typeof summary.byPaymentMethod).toBe('object');
  });
});
