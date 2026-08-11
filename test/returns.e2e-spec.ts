import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
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
  let saleNumber: string;
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

    const product = productRes.body;
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

    warehouseId = warehouseRes.body.id;

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

    clientId = clientRes.body.id;

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

    const sale = saleRes.body;
    saleId = sale.id;
    saleNumber = sale.saleNumber;
    saleItemId = sale.items[0].id;
    _saleItemQuantity = sale.items[0].quantity;

    // ── Record stock after sale (before return) ──

    const stockRes = await request(app.getHttpServer())
      .get(`/api/inventory/stock/variant/${variantId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const stocks = stockRes.body;
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

    const ret = res.body;
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

    const stocks = res.body;
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

    const returns = res.body;
    expect(Array.isArray(returns)).toBe(true);

    const found = returns.find((r: any) => r.id === returnId);
    expect(found).toBeDefined();
    expect(found.returnNumber).toBeDefined();
    expect(found.status).toBe('COMPLETED');
  });

  it('GET /api/returns?page= → pagina en el servidor y dice el total', async () => {
    // Sin parámetros sigue devolviendo el arreglo completo (compatibilidad);
    // con `page`/`limit` devuelve la página y el total, que es lo que necesita
    // la pantalla para no traerse la tabla entera.
    const res = await request(app.getHttpServer())
      .get('/api/returns?page=1&limit=1')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBe(1);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
    expect(res.body.totalPages).toBe(res.body.total);

    // Un limit absurdo se recorta al tope en vez de leerse la base entera.
    const tope = await request(app.getHttpServer())
      .get('/api/returns?page=1&limit=99999')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(tope.body.limit).toBe(200);
  });

  // ─── RETURN DETAIL ───

  it('GET /api/returns/:id → returns full return detail with items', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/returns/${returnId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const ret = res.body;
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

    const creditNotes = res.body;
    expect(Array.isArray(creditNotes)).toBe(true);

    const found = creditNotes.find((cn: any) => cn.returnId === returnId);
    expect(found).toBeDefined();
    expect(found.creditNoteNumber).toBeDefined();
    expect(Number(found.amount)).toBeGreaterThan(0);
    expect(found.return).toBeDefined();
  });

  // ─── VALIDATION: RETURN MORE THAN SOLD ───

  it('GET /api/returns/sales/search → trae el saldo ya devuelto', async () => {
    const sale = await request(app.getHttpServer())
      .get('/api/returns/sales/search')
      .query({ q: saleNumber })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const item = sale.body.items.find(
      (candidate: { id: string }) => candidate.id === saleItemId,
    );
    expect(item.returnedQuantity).toBe(2);
    expect(item.returnableQuantity).toBe(1);
  });

  it('serializa dos devoluciones concurrentes y no excede el saldo vendido', async () => {
    const payload = {
      saleId,
      reason: 'Concurrencia E2E',
      items: [{ saleItemId, quantity: 1 }],
    };
    const responses = await Promise.all(
      [payload, payload].map((body) =>
        request(app.getHttpServer())
          .post('/api/returns')
          .set('Authorization', `Bearer ${token}`)
          .send(body),
      ),
    );
    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 400,
    ]);
    expect(
      responses.find((response) => response.status === 400)?.body.message,
    ).toContain('saldo pendiente');
  });

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

  it('buscar una factura histórica sin líneas responde, no revienta', async () => {
    // Las facturas importadas de la contabilidad vieja no tienen líneas de
    // venta. La búsqueda armaba un `IN ()` vacío y PostgreSQL la rechazaba:
    // buscar esa factura respondía 500.
    const venta = await request(app.getHttpServer())
      .post('/api/pos/sales')
      .set('Authorization', `Bearer ${token}`)
      .send({
        clientId,
        warehouseId,
        items: [{ variantId, quantity: 1 }],
        payments: [{ method: 'EFECTIVO', amount: 35700 }],
      })
      .expect(201);

    // Se le quitan las líneas para dejarla como las importadas.
    const dataSource = app.get(DataSource);
    await dataSource.query('DELETE FROM sale_items WHERE sale_id = $1', [
      venta.body.id,
    ]);

    const res = await request(app.getHttpServer())
      .get(`/api/returns/sales/search?q=${venta.body.saleNumber}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.id).toBe(venta.body.id);
    expect(res.body.items).toEqual([]);
  });
});
