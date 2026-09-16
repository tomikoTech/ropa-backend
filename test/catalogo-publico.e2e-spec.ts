import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { setupTestApp, loginAsAdmin, teardownTestApp } from './helpers/setup';

/**
 * **El catálogo público: ver, pedir, y que la tienda se entere.**
 *
 * La gente pidió un catálogo con carrito, sin página web. Lo que se fija acá:
 * que se publique de una lo que tiene existencia; que hacia afuera salga el
 * precio al detal y «disponible/agotado» —nunca el costo ni cuántos quedan—;
 * que un cliente sin cuenta pueda pedir; y que a la tienda le llegue el
 * aviso y vea el pedido en Pedidos.
 */
describe('Catálogo público (e2e)', () => {
  let app: INestApplication;
  let token: string;
  const ts = Date.now();
  const auth = () => ({ Authorization: `Bearer ${token}` });
  let slug: string;
  let productId: string;
  let variantConStock: string;

  beforeAll(async () => {
    app = await setupTestApp();
    token = await loginAsAdmin(app);
    const ajustes = await request(app.getHttpServer())
      .get('/api/store-settings')
      .set(auth())
      .expect(200);
    slug = ajustes.body.storeSlug;
    expect(slug).toBeTruthy();
    // El catálogo está prendido de nacimiento, sin tienda en línea.
    await request(app.getHttpServer())
      .patch('/api/store-settings')
      .set(auth())
      .send({ isStorefrontActive: false, catalogoEnabled: true })
      .expect(200);

    const bodegas = await request(app.getHttpServer())
      .get('/api/inventory/warehouses')
      .set(auth())
      .expect(200);
    const prod = await request(app.getHttpServer())
      .post('/api/products')
      .set(auth())
      .send({
        name: `E2ECAT Runner ${ts}`,
        brand: 'Nike',
        gender: 'HOMBRE',
        basePrice: 189900,
        costPrice: 90000,
        wholesalePrice: 120000,
        variants: [
          { size: '40', color: 'Negro' },
          { size: '41', color: 'Negro' },
        ],
      })
      .expect(201);
    productId = prod.body.id;
    // Nace publicado; se despublica para probar que «publicar todo» lo trae.
    expect(prod.body.isPublished).toBe(true);
    await request(app.getHttpServer())
      .patch(`/api/products/${productId}/unpublish`)
      .set(auth())
      .expect(200);
    const v40 = prod.body.variants.find(
      (v: { sizeName?: string; size?: string }) => (v.sizeName ?? v.size) === '40',
    );
    variantConStock = v40.id;
    await request(app.getHttpServer())
      .post('/api/inventory/adjust')
      .set(auth())
      .send({
        variantId: v40.id,
        warehouseId: bodegas.body[0].id,
        quantity: 3,
        movementType: 'IN',
        notes: 'e2e',
      })
      .expect(201);
  });

  afterAll(async () => {
    await teardownTestApp();
  });

  it('un producto nuevo nace publicado', async () => {
    const r = await request(app.getHttpServer())
      .post('/api/products')
      .set(auth())
      .send({ name: `E2ECAT Nace publicado ${ts}`, basePrice: 1000, variants: [{ size: 'U', color: 'Único' }] })
      .expect(201);
    expect(r.body.isPublished).toBe(true);
  });

  it('publica de una lo que tiene existencia', async () => {
    const r = await request(app.getHttpServer())
      .post('/api/store-settings/catalogo/publicar-con-existencia')
      .set(auth())
      .expect(201);
    expect(r.body.publicados).toBeGreaterThanOrEqual(1);
    const p = await request(app.getHttpServer())
      .get(`/api/products/${productId}`)
      .set(auth())
      .expect(200);
    expect(p.body.isPublished).toBe(true);
  });

  it('hacia afuera sale el precio al detal y disponible/agotado, sin costo ni cantidades', async () => {
    const r = await request(app.getHttpServer())
      .get(`/api/storefront/${slug}/catalogo`)
      .expect(200);
    expect(r.body.tienda.slug).toBe(slug);
    const p = r.body.productos.find((x: { id: string }) => x.id === productId);
    expect(p).toBeDefined();
    expect(p.precio).toBe(189900);
    expect(p.marca).toBe('Nike');
    expect(p.tallas.map((t: { talla: string; disponible: boolean }) => [t.talla, t.disponible])).toEqual([
      ['40', true],
      ['41', false],
    ]);
    expect(JSON.stringify(p)).not.toMatch(/90000|120000|costPrice|wholesale|"stock"|quantity/);
    expect(r.body.filtros.marcas).toContain('Nike');
    expect(r.body.filtros.tallas).toEqual(expect.arrayContaining(['40', '41']));
  });

  it('la tienda en línea tampoco deja salir el costo', async () => {
    await request(app.getHttpServer())
      .patch('/api/store-settings')
      .set(auth())
      .send({ isStorefrontActive: true })
      .expect(200);
    const r = await request(app.getHttpServer())
      .get(`/api/storefront/${slug}/products`)
      .expect(200);
    const p = r.body.find((x: { id: string }) => x.id === productId);
    expect(p).toBeDefined();
    expect(p).not.toHaveProperty('costPrice');
    expect(p).not.toHaveProperty('wholesalePrice');
    await request(app.getHttpServer())
      .patch('/api/store-settings')
      .set(auth())
      .send({ isStorefrontActive: false })
      .expect(200);
  });

  it('un cliente sin cuenta pide, la tienda lo ve en Pedidos y le llega el aviso', async () => {
    const pedido = await request(app.getHttpServer())
      .post(`/api/storefront/${slug}/orders`)
      .send({
        customerName: 'Laura Cliente',
        customerPhone: '3001234567',
        customerNotes: 'Paso el sábado',
        deliveryMethod: 'pickup',
        items: [{ variantId: variantConStock, quantity: 1 }],
      })
      .expect(201);
    expect(pedido.body.orderNumber).toBeTruthy();
    expect(pedido.body.whatsappUrl).toMatch(/wa\.me/);

    const pedidos = await request(app.getHttpServer())
      .get('/api/store-settings/orders')
      .set(auth())
      .expect(200);
    expect(pedidos.body.some((o: { id: string }) => o.id === pedido.body.orderId)).toBe(true);

    // El aviso llega aparte de la respuesta: se le da un respiro.
    let avisos: { title: string; link: string }[] = [];
    for (let i = 0; i < 10 && !avisos.some((a) => a.title.includes(pedido.body.orderNumber)); i++) {
      await new Promise((r) => setTimeout(r, 150));
      const r = await request(app.getHttpServer())
        .get('/api/notifications?limit=20')
        .set(auth())
        .expect(200);
      avisos = r.body.data ?? r.body;
    }
    const aviso = avisos.find((a) => a.title.includes(pedido.body.orderNumber));
    expect(aviso).toBeDefined();
    expect(aviso!.link).toBe('/storefront/orders');
  });

  it('con el catálogo apagado no hay catálogo ni pedidos', async () => {
    await request(app.getHttpServer())
      .patch('/api/store-settings')
      .set(auth())
      .send({ catalogoEnabled: false })
      .expect(200);
    await request(app.getHttpServer()).get(`/api/storefront/${slug}/catalogo`).expect(404);
    await request(app.getHttpServer())
      .post(`/api/storefront/${slug}/orders`)
      .send({
        customerName: 'Laura',
        customerPhone: '3001234567',
        items: [{ variantId: variantConStock, quantity: 1 }],
      })
      .expect(400);
    await request(app.getHttpServer())
      .patch('/api/store-settings')
      .set(auth())
      .send({ catalogoEnabled: true })
      .expect(200);
  });
});
