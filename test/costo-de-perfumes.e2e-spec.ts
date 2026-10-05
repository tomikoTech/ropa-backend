import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { setupTestApp, teardownTestApp } from './helpers/setup';
import { crearTiendaDePerfumeria } from './helpers/perfumeria';

/**
 * **«Costo de perfumes»: la página que pidió Andrea.**
 *
 * Con los números de Jefferson: el frasco se compró a 30.000, la esencia
 * fija es 7.000 y la mano de obra general 7.000 → 44.000. Se vende a 60.000:
 * de lista gana 16.000 y con 15 % gana 7.000. Si a ese perfume le bajan la
 * mano de obra a 5.000 desde la fila, el costo baja a 42.000 y queda
 * guardado en `cost_price`, que es lo que la venta congela.
 */
describe('Costo de perfumes (e2e)', () => {
  let app: INestApplication;
  let token: string;
  const ts = Date.now();
  const h = () => ({ Authorization: `Bearer ${token}` });
  let bodega: string;
  let frascoVariant: string;
  let locionProduct: string;
  let sinFrascoProduct: string;

  beforeAll(async () => {
    app = await setupTestApp();
    token = (await crearTiendaDePerfumeria(app, ts)).token;
    bodega = (
      await request(app.getHttpServer())
        .post('/api/inventory/warehouses')
        .set(h())
        .send({
          name: `VENTA ${ts}`,
          code: `VE-${ts.toString().slice(-5)}`,
          isPosLocation: true,
        })
        .expect(201)
    ).body.id as string;
    await request(app.getHttpServer())
      .patch('/api/store-settings')
      .set(h())
      .send({
        defaultWarehouseId: bodega,
        costoFijoDeEsencia: 7000,
        manoDeObraPorUnidad: 7000,
        descuentosPresets: [10, 15, 20, 30],
      })
      .expect(200);
    const catFrasco = (
      await request(app.getHttpServer())
        .post('/api/categories')
        .set(h())
        .send({ name: `Cat FRASCO ${ts}`, type: 'FRASCO' })
        .expect(201)
    ).body.id as string;
    const producto = async (
      name: string,
      categoryId?: string,
      extra: Record<string, unknown> = {},
    ) => {
      const r = await request(app.getHttpServer())
        .post('/api/products')
        .set(h())
        .send({
          name: `${name} ${ts}`,
          basePrice: 60000,
          costPrice: 0,
          categoryId,
          variants: [{ size: 'U', color: 'Único' }],
          ...extra,
        })
        .expect(201);
      return {
        productId: r.body.id as string,
        variantId: r.body.variants[0].id as string,
      };
    };
    frascoVariant = (await producto('Frasco Good Girl', catFrasco)).variantId;
    locionProduct = (
      await producto('Good Girl', undefined, { frascoVariantId: frascoVariant })
    ).productId;
    sinFrascoProduct = (await producto('Yara sin frasco')).productId;

    // El frasco llega por compra a 30.000: ese es el costo que manda.
    const sup = await request(app.getHttpServer())
      .post('/api/suppliers')
      .set(h())
      .send({
        name: `Frascos SAS ${ts}`,
        nit: `903${ts.toString().slice(-6)}-1`,
      })
      .expect(201);
    const orden = await request(app.getHttpServer())
      .post('/api/purchases')
      .set(h())
      .send({
        supplierId: sup.body.id,
        warehouseId: bodega,
        items: [
          { variantId: frascoVariant, quantityOrdered: 10, unitCost: 30000 },
        ],
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/purchases/${orden.body.id}/send`)
      .set(h())
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/purchases/${orden.body.id}/receive`)
      .set(h())
      .send({
        items: [{ itemId: orden.body.items[0].id, quantityReceived: 10 }],
      })
      .expect(201);
  }, 120000);

  afterAll(async () => {
    await teardownTestApp();
  });

  const filaDe = (body: { perfumes: { productId: string }[] }, id: string) =>
    body.perfumes.find((p) => p.productId === id) as {
      frasco: { costo: number; origen: string } | null;
      manoDeObraDelProducto: number | null;
      costo: {
        total: number;
        utilidad: number;
        avisos: string[];
        conDescuento: {
          porcentaje: number;
          precio: number;
          utilidad: number;
        }[];
      };
    };

  it('lista cada perfume con su costo (30 + 7 + 7 = 44) y la utilidad con cada descuento', async () => {
    const r = await request(app.getHttpServer())
      .get('/api/production/costos')
      .set(h())
      .expect(200);
    expect(r.body.esenciaFijaPorUnidad).toBe(7000);
    expect(r.body.manoDeObraGeneral).toBe(7000);
    expect(r.body.presets).toEqual([10, 15, 20, 30]);
    // El frasco no es un perfume: no sale en la lista.
    expect(
      r.body.perfumes.some((p: { nombre: string }) =>
        p.nombre.startsWith('Frasco'),
      ),
    ).toBe(false);

    const gg = filaDe(r.body, locionProduct);
    expect(gg.frasco).toMatchObject({ costo: 30000, origen: 'compra' });
    expect(gg.costo.total).toBe(44000);
    expect(gg.costo.utilidad).toBe(16000);
    expect(gg.costo.avisos).toEqual([]);
    expect(gg.costo.conDescuento.find((d) => d.porcentaje === 15)).toEqual({
      porcentaje: 15,
      precio: 51000,
      utilidad: 7000,
    });
    expect(
      gg.costo.conDescuento.find((d) => d.porcentaje === 30)?.utilidad,
    ).toBe(-2000);

    // Sin frasco enlazado el costo sale igual, avisando.
    const yara = filaDe(r.body, sinFrascoProduct);
    expect(yara.frasco).toBeNull();
    expect(yara.costo.total).toBe(14000);
    expect(yara.costo.avisos[0]).toMatch(/frasco/i);

    // Y `cost_price` quedó al día aunque nunca se registrara una entrada de terminado.
    const prod = await request(app.getHttpServer())
      .get(`/api/products/${locionProduct}`)
      .set(h())
      .expect(200);
    expect(Number(prod.body.costPrice)).toBe(44000);
  }, 60000);

  it('bajar la mano de obra de un perfume desde la fila cambia su costo y lo guarda', async () => {
    const r = await request(app.getHttpServer())
      .patch(`/api/production/costos/${locionProduct}`)
      .set(h())
      .send({ manoDeObra: 5000 })
      .expect(200);
    expect(r.body.manoDeObraDelProducto).toBe(5000);
    expect(r.body.costo.manoDeObra).toBe(5000);
    expect(r.body.costo.total).toBe(42000);
    const prod = await request(app.getHttpServer())
      .get(`/api/products/${locionProduct}`)
      .set(h())
      .expect(200);
    expect(Number(prod.body.costPrice)).toBe(42000);
    expect(prod.body.manoDeObra).toBe(5000);

    // `null` vuelve a la general.
    const back = await request(app.getHttpServer())
      .patch(`/api/production/costos/${locionProduct}`)
      .set(h())
      .send({ manoDeObra: null })
      .expect(200);
    expect(back.body.manoDeObraDelProducto).toBeNull();
    expect(back.body.costo.total).toBe(44000);
  }, 60000);

  it('el costo del frasco a mano solo vale cuando el frasco nunca se ha comprado', async () => {
    // Good Girl ya tiene compra: a mano no se acepta.
    await request(app.getHttpServer())
      .patch(`/api/production/costos/${locionProduct}`)
      .set(h())
      .send({ costoFrasco: 25000 })
      .expect(400);
    // Sin frasco enlazado tampoco tiene a qué pegarse.
    await request(app.getHttpServer())
      .patch(`/api/production/costos/${sinFrascoProduct}`)
      .set(h())
      .send({ costoFrasco: 25000 })
      .expect(400);
    // Un frasco nuevo, nunca comprado: el valor a mano manda.
    const catFrasco = (
      await request(app.getHttpServer())
        .get('/api/categories')
        .set(h())
        .expect(200)
    ).body.find((c: { type: string }) => c.type === 'FRASCO').id as string;
    const frascoNuevo = await request(app.getHttpServer())
      .post('/api/products')
      .set(h())
      .send({
        name: `Frasco Yara ${ts}`,
        basePrice: 0,
        costPrice: 0,
        categoryId: catFrasco,
        variants: [{ size: 'U', color: 'Único' }],
      })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/api/products/${sinFrascoProduct}`)
      .set(h())
      .send({ frascoVariantId: frascoNuevo.body.variants[0].id })
      .expect(200);
    const r = await request(app.getHttpServer())
      .patch(`/api/production/costos/${sinFrascoProduct}`)
      .set(h())
      .send({ costoFrasco: 25000 })
      .expect(200);
    expect(r.body.frasco).toMatchObject({ costo: 25000, origen: 'manual' });
    expect(r.body.costo.total).toBe(39000);
    expect(r.body.costo.avisos).toEqual([]);
  }, 60000);
});
