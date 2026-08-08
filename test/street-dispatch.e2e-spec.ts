import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { setupTestApp, loginAsAdmin, teardownTestApp } from './helpers/setup';

/**
 * F6 — patinadores y remisión rápida.
 *
 * El ciclo completo con números comprobables: se despacha, se cuadra, y el
 * inventario y la plata tienen que quedar donde deben.
 *
 * Lo que más importa verificar aquí es que **el inventario no se descuenta dos
 * veces**: sale al despachar, y la venta que se genera al cuadrar NO vuelve a
 * descontarlo. Ese es el error fácil de cometer y el que dejaría el stock en
 * negativo sin que nadie lo note hasta el conteo físico.
 */
describe('Patinadores y remisión rápida (e2e)', () => {
  let app: INestApplication;
  let token: string;
  const suffix = Date.now();

  let warehouseId: string;
  let variantId: string;
  let sellerId: string;
  let sellerCode: string;

  const PRICE = 50000;
  const COST = 20000;
  const STOCK = 30;

  const auth = () => ({ Authorization: `Bearer ${token}` });

  const stockEnBodega = async (): Promise<number> => {
    const res = await request(app.getHttpServer())
      .get(`/api/inventory/stock/variant/${variantId}`)
      .set(auth())
      .expect(200);
    const fila = res.body.find(
      (s: { warehouseId: string }) => s.warehouseId === warehouseId,
    );
    return Number(fila?.quantity ?? 0);
  };

  beforeAll(async () => {
    app = await setupTestApp();
    token = await loginAsAdmin(app);

    const wh = await request(app.getHttpServer())
      .post('/api/inventory/warehouses')
      .set(auth())
      .send({
        name: `E2E Calle WH ${suffix}`,
        code: `CAL-${suffix}`,
        isPosLocation: true,
      })
      .expect(201);
    warehouseId = wh.body.id;

    const product = await request(app.getHttpServer())
      .post('/api/products')
      .set(auth())
      .send({
        name: `E2E Calle Producto ${suffix}`,
        basePrice: PRICE,
        costPrice: COST,
        taxRate: 0,
        variants: [{ size: '42', color: 'Azul calle' }],
      })
      .expect(201);
    variantId = product.body.variants[0].id;

    await request(app.getHttpServer())
      .post('/api/inventory/adjust')
      .set(auth())
      .send({
        variantId,
        warehouseId,
        quantity: STOCK,
        movementType: 'IN',
        notes: 'stock para la calle',
      })
      .expect(201);
  }, 90000);

  afterAll(async () => {
    await teardownTestApp();
  });

  // ── Patinadores ───────────────────────────────────────────────────────────

  it('crear un patinador le genera el carnet solo', async () => {
    // En el sistema anterior el único patinador registrado no tenía código y
    // por eso no se le podía despachar nada: el código no puede faltar.
    const res = await request(app.getHttpServer())
      .post('/api/street/sellers')
      .set(auth())
      .send({ name: `Patinador ${suffix}`, phone: '3001112233' })
      .expect(201);

    sellerId = res.body.id;
    sellerCode = res.body.code;
    expect(sellerCode).toMatch(/^77\d{7}$/);
    expect(res.body.isActive).toBe(true);
  });

  it('el carnet se puede escanear y trae al patinador', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/street/sellers/by-code/${sellerCode}`)
      .set(auth())
      .expect(200);
    expect(res.body.id).toBe(sellerId);
  });

  it('un carnet que no existe lo dice, en vez de fallar en seco', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/street/sellers/by-code/770000999')
      .set(auth())
      .expect(404);
    expect(res.body.message).toContain('carnet');
  });

  // ── Despachar ─────────────────────────────────────────────────────────────

  let dispatchId: string;

  it('despachar saca la mercancía del inventario', async () => {
    const antes = await stockEnBodega();
    expect(antes).toBe(STOCK);

    const res = await request(app.getHttpServer())
      .post('/api/street/dispatches')
      .set(auth())
      .send({
        streetSellerId: sellerId,
        warehouseId,
        items: [{ variantId, quantity: 10 }],
        notes: 'Ruta del centro',
      })
      .expect(201);

    dispatchId = res.body.id;
    expect(res.body.dispatchNumber).toMatch(/^RRP-\d{5}$/);
    expect(res.body.status).toBe('OPEN');
    expect(res.body.summary.dispatched).toBe(10);
    // Nada vendido todavía: todo está "en la calle".
    expect(res.body.summary.sold).toBe(0);
    expect(res.body.summary.missing).toBe(10);

    expect(await stockEnBodega()).toBe(STOCK - 10);
  });

  it('no se puede despachar más de lo que hay, y lo dice con cifras', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/street/dispatches')
      .set(auth())
      .send({
        streetSellerId: sellerId,
        warehouseId,
        items: [{ variantId, quantity: 9999 }],
      })
      .expect(400);
    expect(res.body.message).toContain('9999');
    expect(res.body.message).toContain(String(STOCK - 10));
  });

  // ── Cuadrar ───────────────────────────────────────────────────────────────

  it('rechaza una conciliación que no cuadra, nombrando el producto', async () => {
    const detalle = await request(app.getHttpServer())
      .get(`/api/street/dispatches/${dispatchId}`)
      .set(auth())
      .expect(200);
    const itemId = detalle.body.items[0].id;

    const res = await request(app.getHttpServer())
      .post(`/api/street/dispatches/${dispatchId}/settle`)
      .set(auth())
      .send({ items: [{ itemId, sold: 8, returned: 5 }] })
      .expect(400);
    const mensaje = Array.isArray(res.body.message)
      ? res.body.message.join(' ')
      : res.body.message;
    expect(mensaje).toContain('E2E Calle Producto');
    expect(mensaje).toContain('10');
  });

  it('no acepta cobrar más de lo que se vendió', async () => {
    // El defecto del sistema anterior: por API aceptaba un abono de $5.000
    // sobre una venta de $1.000 porque la regla vivía en el JavaScript.
    const detalle = await request(app.getHttpServer())
      .get(`/api/street/dispatches/${dispatchId}`)
      .set(auth())
      .expect(200);
    const itemId = detalle.body.items[0].id;

    const res = await request(app.getHttpServer())
      .post(`/api/street/dispatches/${dispatchId}/settle`)
      .set(auth())
      .send({
        items: [{ itemId, sold: 1, returned: 9 }],
        payments: [{ method: 'EFECTIVO', amount: 999999 }],
      })
      .expect(400);
    expect(res.body.message).toContain('999.999');
  });

  it('cuadrar: lo devuelto vuelve al inventario y lo vendido se hace venta', async () => {
    const detalle = await request(app.getHttpServer())
      .get(`/api/street/dispatches/${dispatchId}`)
      .set(auth())
      .expect(200);
    const itemId = detalle.body.items[0].id;

    // Vendió 6, devolvió 3, se perdió 1.
    const res = await request(app.getHttpServer())
      .post(`/api/street/dispatches/${dispatchId}/settle`)
      .set(auth())
      .send({
        items: [{ itemId, sold: 6, returned: 3 }],
        payments: [{ method: 'EFECTIVO', amount: 6 * PRICE }],
      })
      .expect(201);

    expect(res.body.status).toBe('SETTLED');
    expect(res.body.summary.sold).toBe(6);
    expect(res.body.summary.returned).toBe(3);
    expect(res.body.summary.missing).toBe(1);
    expect(res.body.summary.revenue).toBe(6 * PRICE);
    expect(res.body.summary.cost).toBe(6 * COST);
    expect(res.body.summary.profit).toBe(6 * (PRICE - COST));
    // El faltante se valora aparte y no se come la utilidad.
    expect(res.body.summary.missingValue).toBe(PRICE);

    // Inventario: salieron 10, volvieron 3. Lo vendido y lo perdido no vuelven.
    expect(await stockEnBodega()).toBe(STOCK - 10 + 3);

    // Y la venta existe de verdad: entra a la caja y al cierre del día.
    expect(res.body.saleId).toBeTruthy();
    const venta = await request(app.getHttpServer())
      .get(`/api/pos/sales/${res.body.saleId}`)
      .set(auth())
      .expect(200);
    expect(venta.body.saleChannel).toBe('CALLE');
    expect(Number(venta.body.total)).toBe(6 * PRICE);
    expect(venta.body.items).toHaveLength(1);
    expect(venta.body.items[0].quantity).toBe(6);
    // El costo va como snapshot en la línea, para la utilidad.
    expect(Number(venta.body.items[0].unitCost)).toBe(COST);
    expect(venta.body.payments).toHaveLength(1);
  });

  it('la venta de la calle NO descuenta inventario otra vez', async () => {
    // Es el error que dejaría el stock en negativo sin que nadie lo note hasta
    // el conteo físico: la mercancía ya salió al despachar.
    expect(await stockEnBodega()).toBe(STOCK - 10 + 3);
  });

  it('una remisión ya cuadrada no se cuadra dos veces', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/street/dispatches/${dispatchId}/settle`)
      .set(auth())
      .send({ items: [] })
      .expect(400);
    expect(res.body.message).toContain('cuadrada');
  });

  // ── Anular ────────────────────────────────────────────────────────────────

  it('anular devuelve la mercancía completa al inventario', async () => {
    const antes = await stockEnBodega();

    const nueva = await request(app.getHttpServer())
      .post('/api/street/dispatches')
      .set(auth())
      .send({
        streetSellerId: sellerId,
        warehouseId,
        items: [{ variantId, quantity: 4 }],
      })
      .expect(201);
    expect(await stockEnBodega()).toBe(antes - 4);

    const res = await request(app.getHttpServer())
      .post(`/api/street/dispatches/${nueva.body.id}/cancel`)
      .set(auth())
      .expect(201);
    expect(res.body.status).toBe('CANCELLED');
    expect(await stockEnBodega()).toBe(antes);
  });

  it('no se puede desactivar a alguien con mercancía en la calle', async () => {
    const abierta = await request(app.getHttpServer())
      .post('/api/street/dispatches')
      .set(auth())
      .send({
        streetSellerId: sellerId,
        warehouseId,
        items: [{ variantId, quantity: 2 }],
      })
      .expect(201);

    const res = await request(app.getHttpServer())
      .patch(`/api/street/sellers/${sellerId}`)
      .set(auth())
      .send({ isActive: false })
      .expect(409);
    expect(res.body.message).toContain('sin cuadrar');

    // Se limpia para no dejar mercancía en la calle en la base de prueba.
    await request(app.getHttpServer())
      .post(`/api/street/dispatches/${abierta.body.id}/cancel`)
      .set(auth())
      .expect(201);
  });

  // ── El reporte ────────────────────────────────────────────────────────────

  it('el reporte de despachos muestra vendido, devuelto y faltante', async () => {
    const hoy = new Date();
    const iso = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;

    const res = await request(app.getHttpServer())
      .get(
        `/api/reports/run/movimientos?mode=patinadores&from=${iso}&to=${iso}` +
          `&search=${encodeURIComponent(`Patinador ${suffix}`)}`,
      )
      .set(auth())
      .expect(200);

    const fila = res.body.rows.find(
      (r: { estado: string }) => r.estado === 'Cuadrada',
    );
    expect(fila).toBeDefined();
    expect(fila.despachado).toBe(10);
    expect(fila.vendido).toBe(6);
    expect(fila.devuelto).toBe(3);
    expect(fila.faltante).toBe(1);
    expect(fila.valorVendido).toBe(6 * PRICE);
    expect(fila.utilidad).toBe(6 * (PRICE - COST));
    expect(fila.valorFaltante).toBe(PRICE);
    // Y avisa de los faltantes en vez de dejarlos pasar callado.
    expect(res.body.warnings.join(' ')).toContain('faltante');
  });
});
