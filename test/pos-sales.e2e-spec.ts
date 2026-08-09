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
        minimumSalePrice: 40000,
        taxRate: 19,
        variants: [
          { size: 'M', color: 'Negro' },
          { size: 'L', color: 'Blanco' },
        ],
      })
      .expect(201);

    const product = productRes.body;
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

    warehouseId = warehouseRes.body.id;

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

    clientId = clientRes.body.id;
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

    const sale = res.body;
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

  it('PATCH /api/pos/sales/:id → updates line price, totals and payment', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/pos/sales/${cashSaleId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [{ variantId: variant1Id, quantity: 2, unitPrice: 60000 }],
        total: 110000,
      })
      .expect(200);

    expect(Number(res.body.subtotal)).toBe(120000);
    expect(Number(res.body.discountAmount)).toBe(10000);
    expect(Number(res.body.total)).toBe(110000);
    expect(res.body.items[0].id).toBe(_cashSaleItemId);
    expect(Number(res.body.items[0].unitPrice)).toBe(60000);
    expect(Number(res.body.items[0].lineTotal)).toBe(110000);
    expect(Number(res.body.payments[0].amount)).toBe(110000);
    expect(Number(res.body.payments[0].changeAmount)).toBe(10000);
  });

  it('PATCH /api/pos/sales/:id → preserves a discount supplied per line', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/pos/sales/${cashSaleId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [
          {
            variantId: variant1Id,
            quantity: 2,
            unitPrice: 60000,
            discountPercent: 15,
          },
        ],
      })
      .expect(200);

    expect(Number(res.body.subtotal)).toBe(120000);
    expect(Number(res.body.discountAmount)).toBe(18000);
    expect(Number(res.body.total)).toBe(102000);
    expect(Number(res.body.items[0].discountPercent)).toBe(15);
    expect(Number(res.body.items[0].lineTotal)).toBe(102000);
    expect(Number(res.body.payments[0].amount)).toBe(102000);
  });

  // ─── VERIFY STOCK DECREASED ───

  it('GET /api/inventory/stock/variant/:id → stock decreased after sale', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/inventory/stock/variant/${variant1Id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const stocks = res.body;
    expect(Array.isArray(stocks)).toBe(true);

    const warehouseStock = stocks.find(
      (s: any) => s.warehouseId === warehouseId,
    );
    expect(warehouseStock).toBeDefined();
    // Started with 10, sold 2 → should be 8
    expect(warehouseStock.quantity).toBe(8);
  });

  it('rechaza en servidor un precio efectivo inferior al mínimo', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/pos/sales')
      .set('Authorization', `Bearer ${token}`)
      .send({
        warehouseId,
        items: [{ variantId: variant1Id, quantity: 1, unitPrice: 39999 }],
        payments: [{ method: 'EFECTIVO', amount: 50000 }],
      });
    expect(res.status).toBe(400);
    expect(String(res.body.message)).toMatch(/no puede venderse por debajo/i);
  });

  it('guarda canal Instagram e impulsador como snapshot por línea', async () => {
    const promoter = await request(app.getHttpServer())
      .post('/api/promoters')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `Impulsador E2E ${uniqueSuffix}` })
      .expect(201);

    const sale = await request(app.getHttpServer())
      .post('/api/pos/sales')
      .set('Authorization', `Bearer ${token}`)
      .send({
        warehouseId,
        saleChannel: 'INSTAGRAM',
        items: [
          {
            variantId: variant2Id,
            quantity: 1,
            promoterId: promoter.body.id,
          },
        ],
        payments: [{ method: 'EFECTIVO', amount: 50000 }],
      })
      .expect(201);

    expect(sale.body.saleChannel).toBe('INSTAGRAM');
    expect(sale.body.items[0].promoterId).toBe(promoter.body.id);
    expect(sale.body.items[0].promoterName).toBe(promoter.body.name);
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

    const sale = res.body;
    expect(sale).toBeDefined();
    expect(sale.saleNumber).toBeDefined();
    expect(sale.status).toBe('COMPLETED');
    expect(Number(sale.total)).toBeGreaterThan(0);

    creditSaleId = sale.id;
  });

  it('PATCH /api/pos/sales/:id → synchronizes the credit account total', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/pos/sales/${creditSaleId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [{ variantId: variant2Id, quantity: 1, unitPrice: 70000 }],
        total: 65000,
      })
      .expect(200);

    expect(Number(res.body.total)).toBe(65000);
    expect(Number(res.body.items[0].unitPrice)).toBe(70000);
    expect(Number(res.body.items[0].lineTotal)).toBe(65000);
    expect(res.body.accountsReceivable).toHaveLength(1);
    expect(Number(res.body.accountsReceivable[0].totalAmount)).toBe(65000);
    expect(Number(res.body.accountsReceivable[0].paidAmount)).toBe(0);
  });

  // ─── LIST SALES ───

  it('GET /api/pos/sales → returns sales list', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/pos/sales')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const sales = res.body;
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

    const sale = res.body;
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

    const arList = res.body;
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

    const ar = res.body;
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

    const ar = res.body;
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

    const ar = res.body;
    expect(ar).toBeDefined();
    expect(ar.isFullyPaid).toBe(true);
  });

  // ─── VERIFY FULLY PAID ───

  it('GET /api/pos/accounts-receivable/:id → verify isFullyPaid true', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/pos/accounts-receivable/${arId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const ar = res.body;
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

    const arList = res.body;
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

    const summary = res.body;
    expect(summary).toBeDefined();
    expect(typeof summary.totalCredit).toBe('number');
    expect(typeof summary.totalPaid).toBe('number');
    expect(typeof summary.totalPending).toBe('number');
    expect(typeof summary.activeAccounts).toBe('number');
    // Our account is fully paid
    expect(summary.totalPending).toBe(0);
    expect(summary.activeAccounts).toBe(0);
  });

  it('aplica un abono FIFO configurable desde la factura más antigua', async () => {
    const sales: { id: string; total: number }[] = [];
    for (let index = 0; index < 3; index++) {
      const sale = await request(app.getHttpServer())
        .post('/api/pos/sales')
        .set('Authorization', `Bearer ${token}`)
        .send({
          clientId,
          warehouseId,
          items: [{ variantId: variant2Id, quantity: 1, unitPrice: 59500 }],
          applyTax: false,
          payments: [{ method: 'CREDITO', amount: 59500 }],
          creditDueDate: `2026-1${index}-2${index + 1}`,
        })
        .expect(201);
      sales.push({ id: sale.body.id, total: Number(sale.body.total) });
    }

    await request(app.getHttpServer())
      .patch('/api/store-settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ arPaymentAllocationMode: 'MANUAL' })
      .expect(200);
    await request(app.getHttpServer())
      .post(
        `/api/pos/accounts-receivable/clients/${clientId}/balance-payment`,
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 100, method: 'EFECTIVO' })
      .expect(400);

    try {
      await request(app.getHttpServer())
        .patch('/api/store-settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ arPaymentAllocationMode: 'FIFO' })
        .expect(200);

      const partialThird = Math.round((sales[2].total / 2) * 100) / 100;
      const paymentAmount = sales[0].total + sales[1].total + partialThird;
      const result = await request(app.getHttpServer())
        .post(
          `/api/pos/accounts-receivable/clients/${clientId}/balance-payment`,
        )
        .set('Authorization', `Bearer ${token}`)
        .send({
          amount: paymentAmount,
          method: 'TRANSFERENCIA',
          reference: 'FIFO-E2E',
        })
        .expect(201);

      expect(result.body.allocations).toHaveLength(3);
      expect(
        result.body.allocations.map((row: { saleId: string }) => row.saleId),
      ).toEqual(sales.map((sale) => sale.id));
      expect(result.body.allocations[0].isFullyPaid).toBe(true);
      expect(result.body.allocations[1].isFullyPaid).toBe(true);
      expect(result.body.allocations[2].isFullyPaid).toBe(false);
      expect(Number(result.body.allocations[2].remainingBalance)).toBeCloseTo(
        sales[2].total - partialThird,
        2,
      );

      const accounts = await request(app.getHttpServer())
        .get(`/api/pos/accounts-receivable?clientId=${clientId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const bySale = new Map<string, { saleId: string; isFullyPaid: boolean }>(
        accounts.body.map(
          (account: { saleId: string; isFullyPaid: boolean }) => [
            account.saleId,
            account,
          ],
        ),
      );
      expect(bySale.get(sales[0].id)?.isFullyPaid).toBe(true);
      expect(bySale.get(sales[1].id)?.isFullyPaid).toBe(true);
      expect(bySale.get(sales[2].id)?.isFullyPaid).toBe(false);
    } finally {
      await request(app.getHttpServer())
        .patch('/api/store-settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ arPaymentAllocationMode: 'MANUAL' });
    }
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

    const summary = res.body;
    expect(typeof summary.totalSales).toBe('number');
    expect(typeof summary.totalAmount).toBe('number');
    expect(typeof summary.totalItems).toBe('number');
    expect(typeof summary.byPaymentMethod).toBe('object');
  });
});
