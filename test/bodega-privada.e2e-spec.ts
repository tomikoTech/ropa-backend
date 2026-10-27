import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { setupTestApp, loginAsAdmin, teardownTestApp } from './helpers/setup';

/**
 * Bodega «solo nosotros». «Necesito que lo de la bodega de locales solo lo
 * veamos nosotros» (Andrea, Distri Amber): la página web no la cuenta y una
 * venta en otra bodega no la toma. Solo sale vendiendo en ella.
 */
describe('Bodega «solo nosotros» (e2e)', () => {
  let app: INestApplication;
  let token: string;
  const ts = Date.now();
  const auth = () => ({ Authorization: `Bearer ${token}` });
  let slugTienda: string;
  let slugProducto: string;
  let principalId: string;
  let localesId: string;
  let variantId: string;

  const http = () => request(app.getHttpServer());
  const bodega = async (nombre: string, extra: object) =>
    (
      await http()
        .post('/api/inventory/warehouses')
        .set(auth())
        .send({ name: `${nombre} ${ts}`, isPosLocation: true, ...extra })
        .expect(201)
    ).body.id as string;
  const cargar = (warehouseId: string, quantity: number) =>
    http()
      .post('/api/inventory/adjust')
      .set(auth())
      .send({ variantId, warehouseId, quantity, movementType: 'IN', notes: 'E2E' })
      .expect((r) => {
        if (r.status !== 200 && r.status !== 201) throw new Error(r.text);
      });
  const enLaWeb = async () => {
    const r = await http().get(`/api/storefront/${slugTienda}/products/${slugProducto}`).expect(200);
    return Number(r.body.variants[0].stock);
  };
  const vender = (warehouseId: string, quantity: number) =>
    http()
      .post('/api/pos/sales')
      .set(auth())
      .send({
        warehouseId,
        items: [{ variantId, quantity }],
        payments: [{ method: 'EFECTIVO', amount: quantity * 50000, receivedAmount: quantity * 50000 }],
        confirmarOtraBodega: true,
      });

  beforeAll(async () => {
    app = await setupTestApp();
    token = await loginAsAdmin(app);
    slugTienda = (await http().get('/api/store-settings').set(auth()).expect(200)).body.storeSlug;
    principalId = await bodega('E2E Principal', {});
    localesId = await bodega('E2E Locales', { isPrivate: true });
    const prod = await http()
      .post('/api/products')
      .set(auth())
      .send({ name: `E2E Privada ${ts}`, basePrice: 50000, costPrice: 20000, variants: [{ size: 'U', color: 'U' }] })
      .expect(201);
    slugProducto = prod.body.slug;
    variantId = prod.body.variants[0].id;
    await http().patch(`/api/products/${prod.body.id}/publish`).set(auth()).expect(200);
    await cargar(principalId, 1);
    await cargar(localesId, 5);
  }, 180000);

  afterAll(async () => {
    await teardownTestApp();
  });

  it('la página web no cuenta lo de la bodega «solo nosotros»', async () => {
    expect(await enLaWeb()).toBe(1);
  });

  it('una venta en otra bodega no la toma, aunque allá no alcance', async () => {
    const r = await vender(principalId, 2).expect(400);
    expect(r.body.message).toMatch(/insuficiente/i);
  });

  it('vendiendo en ella, sí sale', async () => {
    await vender(localesId, 2).expect(201);
  });

  it('la bodega de la página web no puede ser «solo nosotros»', async () => {
    const s = (await http().get('/api/store-settings').set(auth()).expect(200)).body;
    const web = s.ecommerceWarehouseId || s.defaultWarehouseId;
    if (!web) return;
    const r = await http().patch(`/api/inventory/warehouses/${web}`).set(auth()).send({ isPrivate: true }).expect(400);
    expect(r.body.message).toMatch(/página web/);
  });

  it('al quitarle la marca, la web vuelve a contarla', async () => {
    await http().patch(`/api/inventory/warehouses/${localesId}`).set(auth()).send({ isPrivate: false }).expect(200);
    expect(await enLaWeb()).toBe(4);
  });
});
