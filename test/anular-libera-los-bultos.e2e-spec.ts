import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { setupTestApp, loginAsAdmin, teardownTestApp } from './helpers/setup';

/**
 * **Anular una venta libera sus cajas, aunque el rastreo se haya apagado
 * después.**
 *
 * Lo que pasó en una tienda: se vendieron dos cajas —quedaron marcadas como
 * vendidas, con su código impreso—, alguien apagó el rastreo por unidades de
 * ese producto al día siguiente, y al anular la venta el agregado volvió a la
 * bodega **pero las cajas se quedaron vendidas para siempre**. Sus códigos no
 * se podían volver a escanear ni vender: mercancía real, invisible para el
 * sistema.
 *
 * `unit_tracking` decide si un producto lleva bultos con código. No puede
 * decidir si se deshace lo que ya se hizo.
 */
describe('Anular libera los bultos aunque el rastreo esté apagado (e2e)', () => {
  let app: INestApplication;
  let token: string;
  const ts = Date.now();
  const auth = () => ({ Authorization: `Bearer ${token}` });

  let productId: string;
  let variantId: string;
  let warehouseId: string;
  let cajas: { id: string; barcode: string }[] = [];
  let saleId: string;

  const estadoDeLasCajas = async () => {
    const r = await request(app.getHttpServer())
      .get(`/api/stock-units/search?productId=${productId}&limit=20`)
      .set(auth())
      .expect(200);
    const filas = r.body.data as { id: string; status: string }[];
    return Object.fromEntries(filas.map((f) => [f.id, f.status]));
  };

  beforeAll(async () => {
    app = await setupTestApp();
    token = await loginAsAdmin(app);

    const wh = await request(app.getHttpServer())
      .post('/api/inventory/warehouses')
      .set(auth())
      .send({
        name: `E2E Anular WH ${ts}`,
        code: `AN-${ts.toString().slice(-5)}`,
        isPosLocation: true,
      })
      .expect(201);
    warehouseId = wh.body.id;

    const prod = await request(app.getHttpServer())
      .post('/api/products')
      .set(auth())
      .send({
        name: `E2EANU Producto ${ts}`,
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
      .send({ productId, boxes: 3, unitsPerBox: 24, warehouseId, unitCost: 40000 })
      .expect(201);

    const encontrados = await request(app.getHttpServer())
      .get(`/api/stock-units/search?productId=${productId}&status=IN_STOCK&limit=10`)
      .set(auth())
      .expect(200);
    cajas = (encontrados.body.data as { id: string; barcode: string }[]).slice(0, 3);
    expect(cajas.length).toBeGreaterThanOrEqual(2);
  }, 120000);

  afterAll(async () => {
    await teardownTestApp();
  });

  it('vender dos cajas las marca como vendidas', async () => {
    const venta = await request(app.getHttpServer())
      .post('/api/pos/sales')
      .set(auth())
      .send({
        warehouseId,
        items: [
          { variantId, quantity: 24, unitPrice: 100000, stockUnitId: cajas[0].id },
          { variantId, quantity: 24, unitPrice: 100000, stockUnitId: cajas[1].id },
        ],
        payments: [{ method: 'EFECTIVO', amount: 4800000 }],
      })
      .expect(201);
    saleId = venta.body.id;

    const estados = await estadoDeLasCajas();
    expect(estados[cajas[0].id]).toBe('SOLD');
    expect(estados[cajas[1].id]).toBe('SOLD');
  }, 60000);

  it('no deja apagar el rastreo mientras quede una caja etiquetada en bodega', async () => {
    // La salvaguarda que se puso después de este mismo caso: apagarlo con
    // cajas vivas deja sus etiquetas sin efecto. Ver `apagar-el-rastreo.ts`.
    const res = await request(app.getHttpServer())
      .patch(`/api/products/${productId}`)
      .set(auth())
      .send({ unitTracking: false })
      .expect(400);
    expect(String(res.body.message)).toMatch(/no se puede apagar/i);
  }, 60000);

  it('apagar el rastreo del producto no borra lo ya vendido', async () => {
    // Sacada la caja que quedaba, apagarlo ya es legítimo: nadie tiene una
    // etiqueta suya en la mano.
    await request(app.getHttpServer())
      .post(`/api/stock-units/${cajas[2].id}/baja`)
      .set(auth())
      .send({ motivo: 'Sobrante de la prueba' })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/products/${productId}`)
      .set(auth())
      .send({ unitTracking: false })
      .expect(200);

    const estados = await estadoDeLasCajas();
    expect(estados[cajas[0].id]).toBe('SOLD');
    expect(estados[cajas[2].id]).toBe('WRITTEN_OFF');
  }, 60000);

  it('anular devuelve las cajas al inventario, no solo el número', async () => {
    await request(app.getHttpServer())
      .post(`/api/pos/sales/${saleId}/cancel`)
      .set(auth())
      .send({})
      .expect(201);

    const estados = await estadoDeLasCajas();
    // Esto es lo que fallaba: el agregado volvía y las cajas seguían vendidas.
    expect(estados[cajas[0].id]).toBe('IN_STOCK');
    expect(estados[cajas[1].id]).toBe('IN_STOCK');
  }, 60000);

  it('y sus códigos se pueden volver a escanear', async () => {
    const r = await request(app.getHttpServer())
      .get(`/api/pos/scan/${cajas[0].barcode}`)
      .set(auth())
      .expect(200);
    expect(r.body.stockUnitId).toBe(cajas[0].id);
  }, 60000);
});
