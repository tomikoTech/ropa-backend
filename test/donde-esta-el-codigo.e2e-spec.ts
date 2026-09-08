import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { setupTestApp, loginAsAdmin, teardownTestApp } from './helpers/setup';

/**
 * **«Busco el código y no sale.»**
 *
 * Un bulto vendido desaparecía de todas las pantallas sin decir por qué, y el
 * escaneo contestaba «ya fue vendida» a secas. Con la caja en la mano eso no
 * es una respuesta: no dice en qué factura quedó, ni qué hacer si esa caja
 * nunca salió de la tienda.
 *
 * Pasó en una tienda: dos cajas quedaron marcadas como vendidas después de una
 * tarde de ediciones, y desde el mostrador se leyó como que el sistema había
 * perdido la mercancía.
 */
describe('Dónde está este código (e2e)', () => {
  let app: INestApplication;
  let token: string;
  const ts = Date.now();
  const auth = () => ({ Authorization: `Bearer ${token}` });

  let productId: string;
  let variantId: string;
  let warehouseId: string;
  let caja: { id: string; barcode: string };
  let saleNumber: string;

  beforeAll(async () => {
    app = await setupTestApp();
    token = await loginAsAdmin(app);

    const wh = await request(app.getHttpServer())
      .post('/api/inventory/warehouses')
      .set(auth())
      .send({
        name: `E2E Donde WH ${ts}`,
        code: `DN-${ts.toString().slice(-5)}`,
        isPosLocation: true,
      })
      .expect(201);
    warehouseId = wh.body.id;

    const prod = await request(app.getHttpServer())
      .post('/api/products')
      .set(auth())
      .send({
        name: `E2EDND Producto ${ts}`,
        basePrice: 100000,
        costPrice: 40000,
        variants: [{ size: 'U', color: 'Negro' }],
      })
      .expect(201);
    productId = prod.body.id;
    variantId = prod.body.variants[0].id;

    await request(app.getHttpServer())
      .post('/api/stock-units/intake')
      .set(auth())
      .send({ productId, boxes: 1, unitsPerBox: 24, warehouseId, unitCost: 40000 })
      .expect(201);

    const encontrados = await request(app.getHttpServer())
      .get(`/api/stock-units/search?productId=${productId}&status=IN_STOCK&limit=5`)
      .set(auth())
      .expect(200);
    caja = (encontrados.body.data as { id: string; barcode: string }[])[0];
  }, 120000);

  afterAll(async () => {
    await teardownTestApp();
  });

  it('una caja disponible dice en qué bodega está', async () => {
    const r = await request(app.getHttpServer())
      .get(`/api/pos/donde-esta/${caja.barcode}`)
      .set(auth())
      .expect(200);
    expect(r.body.encontrado).toBe(true);
    expect(r.body.disponible).toBe(true);
    expect(r.body.mensaje).toContain(`E2E Donde WH ${ts}`);
  }, 60000);

  it('vendida, nombra la factura donde quedó', async () => {
    const venta = await request(app.getHttpServer())
      .post('/api/pos/sales')
      .set(auth())
      .send({
        warehouseId,
        items: [
          { variantId, quantity: 24, unitPrice: 100000, stockUnitId: caja.id },
        ],
        payments: [{ method: 'EFECTIVO', amount: 2400000 }],
      })
      .expect(201);
    saleNumber = venta.body.saleNumber;

    const r = await request(app.getHttpServer())
      .get(`/api/pos/donde-esta/${caja.barcode}`)
      .set(auth())
      .expect(200);
    expect(r.body.disponible).toBe(false);
    expect(r.body.mensaje).toContain(saleNumber);
    // Y qué hacer con la caja en la mano.
    expect(r.body.mensaje).toContain('quítala de esa factura');
  }, 60000);

  it('el escaneo contesta lo mismo, no «no está disponible» a secas', async () => {
    const r = await request(app.getHttpServer())
      .get(`/api/pos/scan/${caja.barcode}`)
      .set(auth())
      .expect(404);
    expect(r.body.message).toContain(saleNumber);
  }, 60000);

  it('un código que no existe se distingue de uno vendido', async () => {
    const r = await request(app.getHttpServer())
      .get('/api/pos/donde-esta/00000000000000000')
      .set(auth())
      .expect(200);
    expect(r.body.encontrado).toBe(false);
    expect(r.body.mensaje).toContain('No hay ningún producto');
  }, 60000);
});
