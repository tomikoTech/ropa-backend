import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { tryLogin } from './helpers/login';

describe('Storefront & E-commerce (e2e)', () => {
  let app: INestApplication;
  let authToken: string;

  const ts = Date.now();
  let tenantSlug = 'tuchapato'; // CI seed slug, will be detected dynamically

  // Setup entities
  let warehouseId: string;
  let categoryId: string;
  let productId: string;
  let variantId: string;

  // Orders
  let orderId: string;
  let orderIdToCancel: string;

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
    authToken = await tryLogin(app);

    // Detect tenant slug from store settings
    const settingsRes = await request(app.getHttpServer())
      .get('/api/store-settings')
      .set('Authorization', `Bearer ${authToken}`);
    if (settingsRes.body?.storeSlug) {
      tenantSlug = settingsRes.body.storeSlug;
    }

    // Create warehouse for the storefront
    const whRes = await request(app.getHttpServer())
      .post('/api/inventory/warehouses')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: `E2E Storefront WH ${ts}`,
        code: `SF-${ts.toString().slice(-4)}`,
      });
    warehouseId = whRes.body.id;

    // Create category
    const catRes = await request(app.getHttpServer())
      .post('/api/categories')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: `E2E Storefront Cat ${ts}` });
    categoryId = catRes.body.id;

    // Create product with variant
    const prodRes = await request(app.getHttpServer())
      .post('/api/products')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: `E2E Storefront Product ${ts}`,
        basePrice: 45000,
        costPrice: 20000,
        categoryId,
        variants: [{ size: 'L', color: 'Blanco' }],
      });
    productId = prodRes.body.id;
    variantId = prodRes.body.variants[0].id;

    // Publish the product
    await request(app.getHttpServer())
      .patch(`/api/products/${productId}/publish`)
      .set('Authorization', `Bearer ${authToken}`);

    // Add stock
    await request(app.getHttpServer())
      .post('/api/inventory/adjust')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        variantId,
        warehouseId,
        quantity: 50,
        movementType: 'IN',
        notes: 'E2E storefront stock',
      });

    // Ensure store settings exist and configure storefront
    // First GET to auto-create if not exists
    await request(app.getHttpServer())
      .get('/api/store-settings')
      .set('Authorization', `Bearer ${authToken}`);

    // Activate storefront with warehouse and whatsapp number
    await request(app.getHttpServer())
      .patch('/api/store-settings')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        isStorefrontActive: true,
        defaultWarehouseId: warehouseId,
        whatsappNumber: '573001234567',
        storeName: `MiPinta E2E ${ts}`,
      });
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  // ─── Store Settings (Authenticated) ───

  it('GET /api/store-settings - should return store settings', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/store-settings')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(res.body).toHaveProperty('storeName');
    expect(res.body).toHaveProperty('storeSlug');
    expect(res.body).toHaveProperty('whatsappNumber');
    expect(res.body).toHaveProperty('isStorefrontActive');
    expect(res.body.isStorefrontActive).toBe(true);
  });

  it('PATCH /api/store-settings - should update store settings', async () => {
    const res = await request(app.getHttpServer())
      .patch('/api/store-settings')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        heroTitle: `E2E Hero ${ts}`,
        aboutText: 'E2E about text',
        accentColor: '#ff5722',
      })
      .expect(200);

    expect(res.body.heroTitle).toBe(`E2E Hero ${ts}`);
    expect(res.body.aboutText).toBe('E2E about text');
    expect(res.body.accentColor).toBe('#ff5722');
  });

  // ─── Public Storefront Endpoints ───

  it('GET /api/storefront/:tenantSlug/settings - PUBLIC should return store config', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/storefront/${tenantSlug}/settings`)
      .expect(200);

    expect(res.body).toHaveProperty('storeName');
    expect(res.body).toHaveProperty('storeSlug');
    expect(res.body).toHaveProperty('whatsappNumber');
    expect(res.body).toHaveProperty('accentColor');
    // Should NOT have isStorefrontActive (private field)
  });

  it('GET /api/storefront/:tenantSlug/products - PUBLIC should return published products', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/storefront/${tenantSlug}/products`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    // Our published product should be in the list
    const found = res.body.find((p: any) => p.id === productId);
    expect(found).toBeDefined();
    expect(found.isPublished).toBe(true);
    expect(found.variants).toBeDefined();
    expect(found.variants.length).toBeGreaterThanOrEqual(1);
  });

  it('GET /api/storefront/:tenantSlug/categories - PUBLIC should return categories', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/storefront/${tenantSlug}/categories`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    const found = res.body.find((c: any) => c.id === categoryId);
    expect(found).toBeDefined();
    expect(found).toHaveProperty('publishedProductCount');
  });

  it('GET /api/storefront/:tenantSlug/promotions - PUBLIC should return active promotions', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/storefront/${tenantSlug}/promotions`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    // May or may not have promotions, but should be an array
  });

  // ─── E-commerce Order Creation ───

  it('POST /api/storefront/:tenantSlug/orders - PUBLIC should create e-commerce order', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/storefront/${tenantSlug}/orders`)
      .send({
        customerName: 'E2E Customer',
        customerPhone: '3009876543',
        customerEmail: 'e2e@test.co',
        items: [{ variantId, quantity: 2 }],
      })
      .expect(201);

    expect(res.body).toHaveProperty('orderNumber');
    expect(res.body).toHaveProperty('whatsappUrl');
    expect(res.body).toHaveProperty('total');
    expect(res.body.orderNumber).toMatch(/^EC-/);
    expect(res.body.whatsappUrl).toContain('wa.me');
  });

  // ─── Order Management (Authenticated) ───

  it('GET /api/store-settings/orders - should return orders list', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/store-settings/orders')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);

    // Get the first order for further tests
    const order = res.body.find(
      (o: any) => o.status === 'PENDING' && o.customerName === 'E2E Customer',
    );
    expect(order).toBeDefined();
    orderId = order.id;
  });

  it('GET /api/store-settings/orders/:id - should return order detail', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/store-settings/orders/${orderId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(res.body.id).toBe(orderId);
    expect(res.body.customerName).toBe('E2E Customer');
    expect(res.body.status).toBe('PENDING');
    expect(res.body.items).toBeDefined();
    expect(res.body.items.length).toBeGreaterThanOrEqual(1);
  });

  it('PATCH /api/store-settings/orders/:id/status - should update order status', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/store-settings/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        status: 'CONFIRMED',
        adminNotes: 'E2E confirmed',
      })
      .expect(200);

    expect(res.body.status).toBe('CONFIRMED');
    expect(res.body.adminNotes).toBe('E2E confirmed');
  });

  // ─── Finalize Order (Stock Deduction) ───

  it('PATCH /api/store-settings/orders/:id/finalize - should finalize order and deduct stock', async () => {
    // Get stock before
    const stockBefore = await request(app.getHttpServer())
      .get(`/api/inventory/stock/variant/${variantId}`)
      .set('Authorization', `Bearer ${authToken}`);
    const qtyBefore =
      stockBefore.body.find((s: any) => s.warehouseId === warehouseId)
        ?.quantity ?? 0;

    const res = await request(app.getHttpServer())
      .patch(`/api/store-settings/orders/${orderId}/finalize`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ warehouseId })
      .expect(200);

    expect(res.body.status).toBe('DELIVERED');

    // Verify stock decreased
    const stockAfter = await request(app.getHttpServer())
      .get(`/api/inventory/stock/variant/${variantId}`)
      .set('Authorization', `Bearer ${authToken}`);
    const qtyAfter =
      stockAfter.body.find((s: any) => s.warehouseId === warehouseId)
        ?.quantity ?? 0;

    // Order had quantity 2
    expect(Number(qtyAfter)).toBe(Number(qtyBefore) - 2);
  });

  // ─── Order Cancellation Flow ───

  it('should create another order and cancel it', async () => {
    // Create a new order
    const createRes = await request(app.getHttpServer())
      .post(`/api/storefront/${tenantSlug}/orders`)
      .send({
        customerName: 'E2E Cancel Customer',
        customerPhone: '3001112222',
        items: [{ variantId, quantity: 3 }],
      })
      .expect(201);

    expect(createRes.body).toHaveProperty('orderNumber');

    // Find the order in the admin list
    const listRes = await request(app.getHttpServer())
      .get('/api/store-settings/orders')
      .set('Authorization', `Bearer ${authToken}`);

    const cancelOrder = listRes.body.find(
      (o: any) =>
        o.status === 'PENDING' && o.customerName === 'E2E Cancel Customer',
    );
    expect(cancelOrder).toBeDefined();
    orderIdToCancel = cancelOrder.id;

    // Get stock before cancel (stock should NOT change since stock is only deducted on finalize)
    const stockBefore = await request(app.getHttpServer())
      .get(`/api/inventory/stock/variant/${variantId}`)
      .set('Authorization', `Bearer ${authToken}`);
    const qtyBefore =
      stockBefore.body.find((s: any) => s.warehouseId === warehouseId)
        ?.quantity ?? 0;

    // Cancel the order
    const cancelRes = await request(app.getHttpServer())
      .patch(`/api/store-settings/orders/${orderIdToCancel}/cancel`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(cancelRes.body.status).toBe('CANCELLED');

    // Verify stock did NOT change (stock is not deducted until finalize, so cancel has nothing to restore)
    const stockAfter = await request(app.getHttpServer())
      .get(`/api/inventory/stock/variant/${variantId}`)
      .set('Authorization', `Bearer ${authToken}`);
    const qtyAfter =
      stockAfter.body.find((s: any) => s.warehouseId === warehouseId)
        ?.quantity ?? 0;

    expect(Number(qtyAfter)).toBe(Number(qtyBefore));
  });

  // ─── Edge Cases ───

  it('PATCH /api/store-settings/orders/:id/finalize - should reject already finalized order', async () => {
    await request(app.getHttpServer())
      .patch(`/api/store-settings/orders/${orderId}/finalize`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ warehouseId })
      .expect(400);
  });

  it('PATCH /api/store-settings/orders/:id/cancel - should reject already cancelled order', async () => {
    await request(app.getHttpServer())
      .patch(`/api/store-settings/orders/${orderIdToCancel}/cancel`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(400);
  });

  it('PATCH /api/store-settings/orders/:id/cancel - should reject cancelling a delivered order', async () => {
    await request(app.getHttpServer())
      .patch(`/api/store-settings/orders/${orderId}/cancel`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(400);
  });

  it('POST /api/storefront/:tenantSlug/orders - should reject order with empty items', async () => {
    await request(app.getHttpServer())
      .post(`/api/storefront/${tenantSlug}/orders`)
      .send({
        customerName: 'Bad Order',
        customerPhone: '3000000000',
        items: [],
      })
      .expect(400);
  });

  it('GET /api/storefront/nonexistent-slug/settings - should return 404', async () => {
    await request(app.getHttpServer())
      .get('/api/storefront/nonexistent-slug/settings')
      .expect(404);
  });

  it('GET /api/storefront/stores - PUBLIC should list active stores', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/storefront/stores')
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    // At least our store should be active
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    const found = res.body.find((s: any) => s.storeSlug === tenantSlug);
    expect(found).toBeDefined();
    expect(found).toHaveProperty('storeName');
  });
});
