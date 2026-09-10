import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { setupTestApp, loginAsAdmin, teardownTestApp } from './helpers/setup';

/**
 * **Las tallas de una caja se saben al abrirla, no antes.**
 *
 * Lo que reportó AMAWAD: una caja de 24 pares, «Tallas mixtas», y al darle
 * Detallar la pantalla contestaba *«Este producto no tiene tallas definidas,
 * créalas primero desde Productos»*. El producto tenía dos variantes y ninguna
 * con talla, porque la caja se ingresó a mano y nadie sabía qué venía adentro.
 *
 * Eso es al revés de como pasa: la caja llega rotulada «x24» y adentro viene
 * el surtido que el proveedor quiso mandar. Quien la abre es quien descubre
 * las tallas, y en ese momento tiene que poder decirlas —no irse a otra
 * pantalla a crear el catálogo del producto y volver—.
 */
describe('Detallar una caja crea las tallas que aparecen (e2e)', () => {
  let app: INestApplication;
  let token: string;
  const ts = Date.now();
  const auth = () => ({ Authorization: `Bearer ${token}` });

  let productId: string;
  let warehouseId: string;
  let cajaId: string;
  let talla38: string;
  let talla39: string;

  const contenido = async () => {
    const r = await request(app.getHttpServer())
      .get(`/api/stock-units/${cajaId}/contents`)
      .set(auth())
      .expect(200);
    return r.body as {
      box: { quantity: number };
      items: { sizeId: string; actualQuantity: number }[];
      availableSizes: { sizeId: string; name: string }[];
      catalogoDeTallas: {
        sizeId: string;
        name: string;
        yaEnElProducto: boolean;
      }[];
    };
  };

  const variantes = async () => {
    const r = await request(app.getHttpServer())
      .get(`/api/products/${productId}`)
      .set(auth())
      .expect(200);
    return r.body.variants as { id: string; size: string; color: string }[];
  };

  beforeAll(async () => {
    app = await setupTestApp();
    token = await loginAsAdmin(app);

    const wh = await request(app.getHttpServer())
      .post('/api/inventory/warehouses')
      .set(auth())
      .send({
        name: `E2E SinTallas WH ${ts}`,
        code: `ST-${ts.toString().slice(-5)}`,
        isPosLocation: true,
      })
      .expect(201);
    warehouseId = wh.body.id;

    // Las tallas existen en la tienda; lo que no existe es la variante de este
    // producto para ellas. Es exactamente el caso de AMAWAD.
    const crearTalla = async (name: string) => {
      const r = await request(app.getHttpServer())
        .post('/api/sizes')
        .set(auth())
        .send({ name })
        .expect(201);
      return r.body.id as string;
    };
    talla38 = await crearTalla(`T38-${ts}`);
    talla39 = await crearTalla(`T39-${ts}`);

    // El producto nace **sin tallas**: una sola variante, sin talla.
    const prod = await request(app.getHttpServer())
      .post('/api/products')
      .set(auth())
      .send({
        name: `E2ESIN Producto ${ts}`,
        basePrice: 100000,
        costPrice: 40000,
        variants: [{ color: 'Negro' }],
      })
      .expect(201);
    productId = prod.body.id;

    const ingreso = await request(app.getHttpServer())
      .post('/api/stock-units/intake')
      .set(auth())
      .send({ productId, boxes: 1, unitsPerBox: 24, warehouseId, unitCost: 40000 })
      .expect(201);
    cajaId = ingreso.body[0].id;
  }, 120000);

  afterAll(async () => {
    await teardownTestApp();
  });

  it('el producto no tiene tallas, pero la caja ofrece el catálogo de la tienda', async () => {
    const { availableSizes, catalogoDeTallas } = await contenido();
    // Esto es lo que dejaba la pantalla en un callejón sin salida.
    expect(availableSizes).toHaveLength(0);
    // Y esto es la salida: las tallas que la tienda sí tiene.
    const nombres = catalogoDeTallas.map((t) => t.name);
    expect(nombres).toContain(`T38-${ts}`);
    expect(nombres).toContain(`T39-${ts}`);
    expect(
      catalogoDeTallas.find((t) => t.name === `T38-${ts}`)?.yaEnElProducto,
    ).toBe(false);
  });

  it('decir «vinieron 10 de la 38 y 14 de la 39» crea sus variantes', async () => {
    await request(app.getHttpServer())
      .post(`/api/stock-units/${cajaId}/contents`)
      .set(auth())
      .send({
        items: [
          { sizeId: talla38, quantity: 10 },
          { sizeId: talla39, quantity: 14 },
        ],
      })
      .expect(201);

    const tallas = (await variantes()).map((v) => v.size);
    expect(tallas).toContain(`T38-${ts}`);
    expect(tallas).toContain(`T39-${ts}`);

    const { items, box } = await contenido();
    expect(box.quantity).toBe(24);
    const porTalla = Object.fromEntries(
      items.map((i) => [i.sizeId, i.actualQuantity]),
    );
    expect(porTalla[talla38]).toBe(10);
    expect(porTalla[talla39]).toBe(14);
  });

  it('la variante nueva hereda el color de la caja: es el mismo par', async () => {
    const nueva = (await variantes()).find((v) => v.size === `T38-${ts}`);
    expect(nueva?.color).toBe('Negro');
  });

  it('y ahora la caja se abre: 24 pares, cada uno con su talla', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/stock-units/${cajaId}/split`)
      .set(auth())
      .send({})
      .expect(201);
    expect(res.body.units).toHaveLength(24);

    const r = await request(app.getHttpServer())
      .get(`/api/stock-units/search?productId=${productId}&kind=UNIT&limit=100`)
      .set(auth())
      .expect(200);
    const pares = r.body.data as { size: { name: string } | null }[];
    const porTalla = pares.reduce<Record<string, number>>((acc, p) => {
      const n = p.size?.name ?? 'sin talla';
      acc[n] = (acc[n] ?? 0) + 1;
      return acc;
    }, {});
    expect(porTalla[`T38-${ts}`]).toBe(10);
    expect(porTalla[`T39-${ts}`]).toBe(14);
  });

  it('detallar dos veces no duplica la variante', async () => {
    const antes = (await variantes()).length;
    // Otra caja del mismo producto, mismas tallas.
    const otra = await request(app.getHttpServer())
      .post('/api/stock-units/intake')
      .set(auth())
      .send({ productId, boxes: 1, unitsPerBox: 6, warehouseId, unitCost: 40000 })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/stock-units/${otra.body[0].id}/contents`)
      .set(auth())
      .send({ items: [{ sizeId: talla38, quantity: 6 }] })
      .expect(201);

    expect((await variantes()).length).toBe(antes);
  });

  it('una talla que no está en el catálogo se rechaza', async () => {
    const otra = await request(app.getHttpServer())
      .post('/api/stock-units/intake')
      .set(auth())
      .send({ productId, boxes: 1, unitsPerBox: 2, warehouseId, unitCost: 40000 })
      .expect(201);

    // La pantalla ofrece el catálogo, así que esto solo pasa con una URL a
    // mano: lo que se crea es la variante que faltaba, no una talla inventada.
    await request(app.getHttpServer())
      .post(`/api/stock-units/${otra.body[0].id}/contents`)
      .set(auth())
      .send({
        items: [
          { sizeId: '11111111-1111-1111-1111-111111111111', quantity: 2 },
        ],
      })
      .expect(400);
  });

  it('manda TODAS las tallas del catálogo, con las que no vinieron en cero', async () => {
    // Es lo que hace la pantalla desde que las tallas salen fijas: se teclea
    // de corrido y las que no vinieron viajan en cero. Se cayó en producción
    // con la caja ya contada —«error interno del servidor»— porque para una
    // talla en cero no hay variante que poner en su fila.
    const otra = await request(app.getHttpServer())
      .post('/api/stock-units/intake')
      .set(auth())
      .send({ productId, boxes: 1, unitsPerBox: 4, warehouseId, unitCost: 40000 })
      .expect(201);
    const cajaId2 = otra.body[0].id;

    const { catalogoDeTallas } = await (async () => {
      const r = await request(app.getHttpServer())
        .get(`/api/stock-units/${cajaId2}/contents`)
        .set(auth())
        .expect(200);
      return r.body as {
        catalogoDeTallas: { sizeId: string; name: string }[];
      };
    })();
    expect(catalogoDeTallas.length).toBeGreaterThan(2);

    await request(app.getHttpServer())
      .post(`/api/stock-units/${cajaId2}/contents`)
      .set(auth())
      .send({
        items: catalogoDeTallas.map((t) => ({
          sizeId: t.sizeId,
          // Solo la 38 vino; el resto del catálogo va en cero.
          quantity: t.sizeId === talla38 ? 4 : 0,
        })),
      })
      .expect(201);

    const r = await request(app.getHttpServer())
      .get(`/api/stock-units/${cajaId2}/contents`)
      .set(auth())
      .expect(200);
    const conAlgo = (r.body.items as { sizeId: string; actualQuantity: number }[])
      .filter((i) => i.actualQuantity > 0);
    expect(conAlgo).toHaveLength(1);
    expect(conAlgo[0].sizeId).toBe(talla38);
    expect(r.body.box.quantity).toBe(4);
  });
});
