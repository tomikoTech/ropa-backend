// Sin R2 a propósito, y **antes** de que arranque nada: el `.env` del proyecto
// apunta al bucket de producción, y una prueba no puede dejar PDF de mentira
// ahí. Con el almacenamiento apagado el endpoint arma el PDF completo y solo
// falla al subirlo, con un 503 que dice por qué —que es justo lo que se quiere
// comprobar acá: permisos, búsqueda de las filas y render—.
process.env.R2_ENDPOINT = '';
process.env.R2_BUCKET = '';

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { setupTestApp, loginAsAdmin, teardownTestApp } from './helpers/setup';

/**
 * El comprobante de una venta de terceros, en PDF, para WhatsApp.
 *
 * Un ticket del revendedor con tres productos son tres filas en
 * `consignments`; el cliente quiere **una** factura. El endpoint recibe los
 * ids del ticket y devuelve el enlace con el número y los totales.
 */
describe('Comprobante de venta de terceros (e2e)', () => {
  let app: INestApplication;
  let token: string;
  const suffix = Date.now();
  const auth = () => ({ Authorization: `Bearer ${token}` });

  const venta = (datos: Record<string, unknown> = {}) =>
    request(app.getHttpServer())
      .post('/api/consignments')
      .set(auth())
      .send({
        thirdPartyName: `E2E Don José ${suffix}`,
        productDescription: `Nike Air Force ${suffix}`,
        size: '40',
        quantity: 1,
        costPrice: 95000,
        salePrice: 150000,
        clientName: 'Marcela',
        ...datos,
      })
      .expect(201)
      .then((r) => r.body as { id: string });

  const comprobante = (ids: unknown) =>
    request(app.getHttpServer())
      .post('/api/documentos/terceros/factura')
      .set(auth())
      .send({ ids });

  beforeAll(async () => {
    app = await setupTestApp();
    token = await loginAsAdmin(app);
  });

  afterAll(async () => {
    await teardownTestApp();
  });

  it('arma el PDF del ticket entero y solo se cae al subirlo, sin almacenamiento', async () => {
    const a = await venta();
    const b = await venta({ productDescription: `Crocs ${suffix}`, salePrice: 98000 });
    const r = await comprobante([a.id, b.id]).expect(503);
    expect(r.body.message).toMatch(/almacenamiento/i);
  });

  it('una fila que no existe es 404, aunque las demás sí', async () => {
    const a = await venta();
    await comprobante([a.id, '00000000-0000-4000-8000-000000000000']).expect(404);
  });

  it('sin ids, o con ids que no son uuid, no pasa la validación', async () => {
    await comprobante([]).expect(400);
    await comprobante(['no-es-un-id']).expect(400);
  });

  /**
   * El ticket mixto: un par propio y otro de un colega en la misma cuenta. El
   * cliente pagó una sola y la factura tiene que decir las dos cosas. Se
   * comprueba por la ruta de la venta, mandando las filas de tercero aparte.
   */
  it('la factura de una venta propia acepta las filas de tercero del mismo ticket', async () => {
    const wh = await request(app.getHttpServer())
      .post('/api/inventory/warehouses')
      .set(auth())
      .send({ name: `E2E Terceros WH ${suffix}`, code: `TE-${String(suffix).slice(-5)}`, isPosLocation: true })
      .expect(201);
    const prod = await request(app.getHttpServer())
      .post('/api/products')
      .set(auth())
      .send({ name: `E2ETER Producto ${suffix}`, basePrice: 50000, costPrice: 20000, variants: [{ size: 'U', color: 'Negro' }] })
      .expect(201);
    const variantId = prod.body.variants[0].id;
    await request(app.getHttpServer())
      .post('/api/inventory/adjust')
      .set(auth())
      .send({ variantId, warehouseId: wh.body.id, quantity: 5, movementType: 'IN', notes: 'Carga de la prueba' })
      .expect((r) => {
        if (r.status !== 200 && r.status !== 201) throw new Error(`Sin stock: ${r.status} ${r.text}`);
      });
    const sale = await request(app.getHttpServer())
      .post('/api/pos/sales')
      .set(auth())
      .send({
        warehouseId: wh.body.id,
        items: [{ variantId, quantity: 1, unitPrice: 50000 }],
        payments: [{ method: 'EFECTIVO', amount: 50000 }],
      })
      .expect(201);
    const tercero = await venta();

    // Sin almacenamiento se cae al subir, con el PDF ya armado con las dos
    // cosas. Una fila de tercero inventada es 404, no una factura a medias.
    const r = await request(app.getHttpServer())
      .post(`/api/documentos/ventas/${sale.body.id}/factura`)
      .set(auth())
      .send({ terceros: [tercero.id] })
      .expect(503);
    expect(r.body.message).toMatch(/almacenamiento/i);
    await request(app.getHttpServer())
      .post(`/api/documentos/ventas/${sale.body.id}/factura`)
      .set(auth())
      .send({ terceros: ['00000000-0000-4000-8000-000000000000'] })
      .expect(404);
  }, 60000);
});
