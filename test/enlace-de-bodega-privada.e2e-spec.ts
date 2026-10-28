import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { setupTestApp, teardownTestApp } from './helpers/setup';
import { crearTiendaDePerfumeria } from './helpers/perfumeria';

/**
 * El enlace privado de la bodega «solo nosotros».
 *
 * «Necesito que lo de la bodega de locales solo lo veamos nosotros. ¿Cómo los
 * locales de nosotros pueden hacer los pedidos por la página?» (Andrea,
 * Distri Amber). El público no ve LOCALES; los locales entran por su enlace,
 * ven **solo** LOCALES y el pedido sale de LOCALES. Se prueba en una
 * perfumería, que es donde el catálogo muestra cuántas quedan.
 */
describe('Enlace de la bodega «solo nosotros» (e2e)', () => {
  let app: INestApplication;
  let token: string;
  const ts = Date.now();
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const http = () => request(app.getHttpServer());
  let slug: string;
  let principalId: string;
  let localesId: string;
  let codigo: string;
  let variantId: string;
  const nombreLocales = `E2E Locales ${ts}`;

  const bodega = async (name: string, extra: object) =>
    (
      await http()
        .post('/api/inventory/warehouses')
        .set(auth())
        .send({ name, isPosLocation: true, ...extra })
        .expect(201)
    ).body;
  const cargar = (warehouseId: string, quantity: number) =>
    http()
      .post('/api/inventory/adjust')
      .set(auth())
      .send({ variantId, warehouseId, quantity, movementType: 'IN', notes: 'E2E' })
      .expect((r) => {
        if (r.status !== 200 && r.status !== 201) throw new Error(r.text);
      });
  const catalogo = (q = '') => http().get(`/api/storefront/${slug}/catalogo${q}`);
  const existencias = (c: { productos: { tallas: { variantId: string; existencias?: number }[] }[] }) =>
    c.productos.flatMap((p) => p.tallas).find((t) => t.variantId === variantId)?.existencias;
  const pedir = (cantidad: number, extra: object = {}) =>
    http()
      .post(`/api/storefront/${slug}/orders`)
      .send({
        customerName: 'Qatar perfumeria',
        customerPhone: '3225874032',
        shippingAddress: 'Local Qatar',
        items: [{ variantId, quantity: cantidad }],
        ...extra,
      });

  beforeAll(async () => {
    app = await setupTestApp();
    ({ token } = await crearTiendaDePerfumeria(app, ts));
    principalId = (await bodega(`E2E Principal ${ts}`, {})).id;
    const locales = await bodega(nombreLocales, { isPrivate: true });
    localesId = locales.id;
    codigo = locales.codigoWeb;
    const ajustes = await http()
      .patch('/api/store-settings')
      .set(auth())
      .send({ catalogoEnabled: true, defaultWarehouseId: principalId })
      .expect(200);
    slug = ajustes.body.storeSlug;
    const prod = await http()
      .post('/api/products')
      .set(auth())
      .send({ name: `E2E Loción ${ts}`, basePrice: 50000, costPrice: 20000, variants: [{ size: 'U', color: 'U' }] })
      .expect(201);
    variantId = prod.body.variants[0].id;
    await http().patch(`/api/products/${prod.body.id}/publish`).set(auth()).expect(200);
    await cargar(principalId, 1);
    await cargar(localesId, 5);
  }, 180000);

  afterAll(async () => {
    await teardownTestApp();
  });

  it('al marcarla «solo nosotros» recibe su código; las demás no tienen', async () => {
    expect(codigo).toMatch(/^[0-9a-f]{12}$/);
    const todas = (await http().get('/api/inventory/warehouses').set(auth()).expect(200)).body;
    expect(todas.find((w: { id: string }) => w.id === principalId).codigoWeb).toBeNull();
  });

  it('el catálogo público no cuenta LOCALES', async () => {
    const c = (await catalogo().expect(200)).body;
    expect(c.tienda.bodega).toBeNull();
    expect(existencias(c)).toBe(1);
  });

  it('por el enlace se ve solo LOCALES, y lo dice', async () => {
    const c = (await catalogo(`?bodega=${codigo}`).expect(200)).body;
    expect(c.tienda.bodega).toBe(nombreLocales);
    expect(existencias(c)).toBe(5);
  });

  it('un enlace que no es se rechaza, en vez de pedir de la bodega equivocada', async () => {
    const r = await catalogo('?bodega=000000000000').expect(404);
    expect(r.body.message).toMatch(/enlace/i);
  });

  it('el pedido por el enlace sale de LOCALES; el público no alcanza', async () => {
    await pedir(4).expect(400);
    const r = await pedir(4, { bodega: codigo }).expect(201);

    const pedidos = (await http().get('/api/store-settings/orders').set(auth()).expect(200)).body;
    const pedido = pedidos.find((o: { id: string }) => o.id === r.body.orderId);
    expect(pedido.warehouseId).toBe(localesId);
    // Al aceptarlo, la tienda ve lo que hay en LOCALES, no en la principal.
    expect(pedido.items[0].disponible).toBe(5);
  });

  it('desmarcarla y volverla a marcar conserva el enlace que ya tienen los locales', async () => {
    await http().patch(`/api/inventory/warehouses/${localesId}`).set(auth()).send({ isPrivate: false }).expect(200);
    await catalogo(`?bodega=${codigo}`).expect(404);
    const w = (
      await http().patch(`/api/inventory/warehouses/${localesId}`).set(auth()).send({ isPrivate: true }).expect(200)
    ).body;
    expect(w.codigoWeb).toBe(codigo);
    await catalogo(`?bodega=${codigo}`).expect(200);
  });
});
