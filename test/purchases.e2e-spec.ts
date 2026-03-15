import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Purchases & Accounts Payable (e2e)', () => {
  let app: INestApplication;
  let authToken: string;

  // Setup entities
  let supplierId: string;
  let warehouseId: string;
  let productId: string;
  let variantId: string;

  // Purchase order
  let purchaseOrderId: string;
  let purchaseItemId: string;
  let quantityOrdered: number;
  let unitCost: number;
  let accountsPayableId: string;

  const ts = Date.now();

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    // Login
    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'tuchapato@gmail.com', password: 'tuchapato123' });
    authToken = loginRes.body.accessToken;

    // Create supplier
    const supplierRes = await request(app.getHttpServer())
      .post('/api/suppliers')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: `E2E Purchase Supplier ${ts}`,
        nit: `900${ts.toString().slice(-6)}-1`,
      });
    supplierId = supplierRes.body.id;

    // Create warehouse
    const warehouseRes = await request(app.getHttpServer())
      .post('/api/inventory/warehouses')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: `E2E Warehouse ${ts}`,
        code: `WH-${ts.toString().slice(-4)}`,
      });
    warehouseId = warehouseRes.body.id;

    // Create product with variant
    const productRes = await request(app.getHttpServer())
      .post('/api/products')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: `E2E Purchase Product ${ts}`,
        basePrice: 50000,
        costPrice: 25000,
        variants: [{ size: 'M', color: 'Negro' }],
      });
    productId = productRes.body.id;
    variantId = productRes.body.variants[0].id;

    // Set initial stock to 0 via adjustment (IN with quantity 0 creates the row)
    await request(app.getHttpServer())
      .post('/api/inventory/adjust')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        variantId,
        warehouseId,
        quantity: 5,
        movementType: 'IN',
        notes: 'E2E initial stock',
      });
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  // ─── Purchase Order CRUD ───

  it('POST /api/purchases - should create purchase order (DRAFT)', async () => {
    quantityOrdered = 20;
    unitCost = 25000;

    const res = await request(app.getHttpServer())
      .post('/api/purchases')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        supplierId,
        warehouseId,
        items: [{ variantId, quantityOrdered, unitCost }],
        notes: 'E2E purchase test',
        paymentDueDate: '2026-12-31',
      })
      .expect(201);

    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('orderNumber');
    expect(res.body.status).toBe('DRAFT');
    expect(Number(res.body.total)).toBe(quantityOrdered * unitCost);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.accountsPayable).toHaveLength(1);

    purchaseOrderId = res.body.id;
    purchaseItemId = res.body.items[0].id;
    accountsPayableId = res.body.accountsPayable[0].id;
  });

  it('GET /api/purchases - should return list containing created order', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/purchases')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    const found = res.body.find((po: any) => po.id === purchaseOrderId);
    expect(found).toBeDefined();
    expect(found.status).toBe('DRAFT');
  });

  it('GET /api/purchases/:id - should return order detail with variant product name', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/purchases/${purchaseOrderId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(res.body.id).toBe(purchaseOrderId);
    expect(res.body.items[0].variant).toBeDefined();
    expect(res.body.items[0].variant.product).toBeDefined();
    expect(res.body.items[0].variant.product.name).toContain('E2E Purchase Product');
  });

  // ─── Purchase Order Lifecycle ───

  it('POST /api/purchases/:id/send - should change status to SENT', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/purchases/${purchaseOrderId}/send`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(201);

    expect(res.body.status).toBe('SENT');
  });

  it('POST /api/purchases/:id/receive - partial receive should set status PARTIAL', async () => {
    const halfQuantity = Math.floor(quantityOrdered / 2);

    // Get stock before
    const stockBefore = await request(app.getHttpServer())
      .get(`/api/inventory/stock/variant/${variantId}`)
      .set('Authorization', `Bearer ${authToken}`);
    const qtyBefore = stockBefore.body.find(
      (s: any) => s.warehouseId === warehouseId,
    )?.quantity ?? 0;

    const res = await request(app.getHttpServer())
      .post(`/api/purchases/${purchaseOrderId}/receive`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        items: [{ itemId: purchaseItemId, quantityReceived: halfQuantity }],
      })
      .expect(201);

    expect(res.body.status).toBe('PARTIAL');

    // Verify stock increased
    const stockAfter = await request(app.getHttpServer())
      .get(`/api/inventory/stock/variant/${variantId}`)
      .set('Authorization', `Bearer ${authToken}`);
    const qtyAfter = stockAfter.body.find(
      (s: any) => s.warehouseId === warehouseId,
    )?.quantity ?? 0;

    expect(Number(qtyAfter)).toBe(Number(qtyBefore) + halfQuantity);
  });

  it('POST /api/purchases/:id/receive - receive remaining should set status RECEIVED', async () => {
    const remaining = quantityOrdered - Math.floor(quantityOrdered / 2);

    const res = await request(app.getHttpServer())
      .post(`/api/purchases/${purchaseOrderId}/receive`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        items: [{ itemId: purchaseItemId, quantityReceived: remaining }],
      })
      .expect(201);

    expect(res.body.status).toBe('RECEIVED');
  });

  // ─── Accounts Payable ───

  it('GET /api/purchases/accounts-payable - should return AP entry', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/purchases/accounts-payable')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    const ap = res.body.find((a: any) => a.id === accountsPayableId);
    expect(ap).toBeDefined();
    expect(ap.isPaid).toBe(false);
    expect(Number(ap.amount)).toBe(quantityOrdered * unitCost);
  });

  it('POST /api/purchases/accounts-payable/:id/payment - partial payment (abono)', async () => {
    const totalAmount = quantityOrdered * unitCost;
    const halfAmount = Math.floor(totalAmount / 2);

    const res = await request(app.getHttpServer())
      .post(`/api/purchases/accounts-payable/${accountsPayableId}/payment`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        amount: halfAmount,
        method: 'EFECTIVO',
        notes: 'Primer abono E2E',
      })
      .expect(201);

    expect(Number(res.body.paidAmount)).toBe(halfAmount);
    expect(res.body.isPaid).toBe(false);
    expect(res.body.payments).toBeDefined();
    expect(res.body.payments.length).toBeGreaterThanOrEqual(1);
  });

  it('GET /api/purchases/accounts-payable - should show updated paidAmount, isPaid false', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/purchases/accounts-payable')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    const ap = res.body.find((a: any) => a.id === accountsPayableId);
    expect(ap).toBeDefined();
    expect(ap.isPaid).toBe(false);
    expect(Number(ap.paidAmount)).toBeGreaterThan(0);
  });

  it('POST /api/purchases/accounts-payable/:id/payment - pay remaining should mark isPaid true', async () => {
    const totalAmount = quantityOrdered * unitCost;
    const halfAmount = Math.floor(totalAmount / 2);
    const remaining = totalAmount - halfAmount;

    const res = await request(app.getHttpServer())
      .post(`/api/purchases/accounts-payable/${accountsPayableId}/payment`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        amount: remaining,
        method: 'TRANSFERENCIA',
        reference: 'REF-E2E-001',
        notes: 'Pago final E2E',
      })
      .expect(201);

    expect(res.body.isPaid).toBe(true);
    expect(Number(res.body.paidAmount)).toBe(totalAmount);
    expect(res.body.paidAt).toBeDefined();
  });

  // ─── Validation / Edge Cases ───

  it('POST /api/purchases - should reject without items', async () => {
    await request(app.getHttpServer())
      .post('/api/purchases')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        supplierId,
        warehouseId,
        items: [],
      })
      .expect(400);
  });

  it('POST /api/purchases/accounts-payable/:id/payment - should reject overpayment', async () => {
    // AP is already fully paid, any amount should fail
    await request(app.getHttpServer())
      .post(`/api/purchases/accounts-payable/${accountsPayableId}/payment`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        amount: 1,
        method: 'EFECTIVO',
      })
      .expect(400);
  });
});
