import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { setupTestApp, teardownTestApp } from './helpers/setup';
import { crearTiendaDePerfumeria } from './helpers/perfumeria';

/**
 * **La producción simple de una perfumería, de punta a punta.**
 *
 * El flujo acordado con Distri Amber: Andrea compra frascos y esencia; César
 * confirma lo que llegó (con lo que llegó malo); César saca esencia en
 * gramos; Andrea registra las lociones terminadas, que descuentan frascos y
 * nacen con su costo; y al vender, la ganancia sale sola.
 *
 * Con los números de Jefferson: frasco 30.000 + esencia 7.000 + mano de obra
 * 7.000 = 44.000; vendida a 60.000 con 15 % se ganan 7.000.
 */
describe('Producción simple (e2e)', () => {
  let app: INestApplication;
  let token: string;
  const ts = Date.now();
  const h = () => ({ Authorization: `Bearer ${token}` });
  let bodegaVenta: string;
  let bodegaInsumos: string;
  let frascoVariant: string;
  let esenciaVariant: string;
  let locionVariant: string;
  let locionProduct: string;

  const stockDe = async (variantId: string, warehouseId: string) => {
    const r = await request(app.getHttpServer())
      .get(`/api/inventory/stock/variant/${variantId}`)
      .set(h())
      .expect(200);
    return Number(
      (r.body as { warehouseId: string; quantity: number }[]).find(
        (s) => s.warehouseId === warehouseId,
      )?.quantity ?? 0,
    );
  };

  beforeAll(async () => {
    app = await setupTestApp();
    token = (await crearTiendaDePerfumeria(app, ts)).token;
    const bodega = async (name: string, pos: boolean) =>
      (
        await request(app.getHttpServer())
          .post('/api/inventory/warehouses')
          .set(h())
          .send({
            name: `${name} ${ts}`,
            code: `${name.slice(0, 2)}-${ts.toString().slice(-5)}`,
            isPosLocation: pos,
          })
          .expect(201)
      ).body.id as string;
    bodegaVenta = await bodega('VENTA', true);
    bodegaInsumos = await bodega('INSUMOS', false);
    await request(app.getHttpServer())
      .patch('/api/store-settings')
      .set(h())
      .send({
        defaultWarehouseId: bodegaVenta,
        costoFijoDeEsencia: 7000,
        manoDeObraPorUnidad: 7000,
      })
      .expect(200);
    const categoria = async (type: string) =>
      (
        await request(app.getHttpServer())
          .post('/api/categories')
          .set(h())
          .send({ name: `Cat ${type} ${ts}`, type })
          .expect(201)
      ).body.id as string;
    const catFrasco = await categoria('FRASCO');
    const catEsencia = await categoria('ESSENCE');
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
    esenciaVariant = (await producto('Esencia Sublime', catEsencia)).variantId;
    const locion = await producto('Good Girl', undefined, {
      frascoVariantId: frascoVariant,
    });
    locionVariant = locion.variantId;
    locionProduct = locion.productId;
    // La esencia llega por compra en otra prueba; acá se carga directo.
    await request(app.getHttpServer())
      .post('/api/inventory/adjust')
      .set(h())
      .send({
        variantId: esenciaVariant,
        warehouseId: bodegaInsumos,
        quantity: 5000,
        movementType: 'IN',
        notes: 'e2e',
      })
      .expect((r) => {
        if (r.status !== 200 && r.status !== 201) throw new Error(r.text);
      });
  }, 120000);

  afterAll(async () => {
    await teardownTestApp();
  });

  it('se reciben 100 frascos, uno averiado: quedan 99, la compra cierra y la avería queda registrada', async () => {
    const sup = await request(app.getHttpServer())
      .post('/api/suppliers')
      .set(h())
      .send({
        name: `Frascos SAS ${ts}`,
        nit: `902${ts.toString().slice(-6)}-1`,
      })
      .expect(201);
    const orden = await request(app.getHttpServer())
      .post('/api/purchases')
      .set(h())
      .send({
        supplierId: sup.body.id,
        warehouseId: bodegaInsumos,
        items: [
          { variantId: frascoVariant, quantityOrdered: 100, unitCost: 30000 },
        ],
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/purchases/${orden.body.id}/send`)
      .set(h())
      .expect(201);
    const r = await request(app.getHttpServer())
      .post(`/api/purchases/${orden.body.id}/receive`)
      .set(h())
      .send({
        items: [
          {
            itemId: orden.body.items[0].id,
            quantityReceived: 100,
            quantityDamaged: 1,
          },
        ],
      })
      .expect(201);
    expect(r.body.status).toBe('RECEIVED');
    expect(r.body.items[0].quantityDamaged).toBe(1);
    expect(await stockDe(frascoVariant, bodegaInsumos)).toBe(99);
    // Más averiadas que recibidas no pasa.
    const orden2 = await request(app.getHttpServer())
      .post('/api/purchases')
      .set(h())
      .send({
        supplierId: sup.body.id,
        warehouseId: bodegaInsumos,
        items: [
          { variantId: frascoVariant, quantityOrdered: 10, unitCost: 30000 },
        ],
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/purchases/${orden2.body.id}/send`)
      .set(h())
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/purchases/${orden2.body.id}/receive`)
      .set(h())
      .send({
        items: [
          {
            itemId: orden2.body.items[0].id,
            quantityReceived: 5,
            quantityDamaged: 6,
          },
        ],
      })
      .expect(400);
  }, 120000);

  it('César saca esencia en gramos y no puede sacar más de lo que hay', async () => {
    await request(app.getHttpServer())
      .post('/api/production/salida-de-esencia')
      .set(h())
      .send({
        variantId: esenciaVariant,
        gramos: 2300,
        notes: 'Para 50 Good Girl',
      })
      .expect(201);
    expect(await stockDe(esenciaVariant, bodegaInsumos)).toBe(2700);
    const demas = await request(app.getHttpServer())
      .post('/api/production/salida-de-esencia')
      .set(h())
      .send({ variantId: esenciaVariant, gramos: 3000 })
      .expect(400);
    expect(demas.body.message).toContain('2700');
    // Una loción no es una esencia.
    await request(app.getHttpServer())
      .post('/api/production/salida-de-esencia')
      .set(h())
      .send({ variantId: locionVariant, gramos: 1 })
      .expect(400);
    const esencias = await request(app.getHttpServer())
      .get('/api/production/esencias')
      .set(h())
      .expect(200);
    const fila = (
      esencias.body as { variantId: string; gramos: number }[]
    ).find((e) => e.variantId === esenciaVariant);
    expect(fila?.gramos).toBe(2700);
  }, 60000);

  it('entran 10 lociones: salen 10 frascos, el costo queda en 44.000 y la venta gana 7.000', async () => {
    const r = await request(app.getHttpServer())
      .post('/api/production/entrada-de-terminado')
      .set(h())
      .send({ variantId: locionVariant, cantidad: 10 })
      .expect(201);
    expect(r.body.costo.total).toBe(44000);
    expect(r.body.costo.avisos).toEqual([]);
    expect(await stockDe(locionVariant, bodegaVenta)).toBe(10);
    expect(await stockDe(frascoVariant, bodegaInsumos)).toBe(89);
    const prod = await request(app.getHttpServer())
      .get(`/api/products/${locionProduct}`)
      .set(h())
      .expect(200);
    expect(Number(prod.body.costPrice)).toBe(44000);

    const venta = await request(app.getHttpServer())
      .post('/api/pos/sales')
      .set(h())
      .send({
        warehouseId: bodegaVenta,
        items: [
          {
            variantId: locionVariant,
            quantity: 1,
            unitPrice: 60000,
            discountPercent: 15,
          },
        ],
        payments: [{ method: 'EFECTIVO', amount: 51000 }],
      })
      .expect(201);
    const detalle = await request(app.getHttpServer())
      .get(`/api/pos/sales/${venta.body.id}`)
      .set(h())
      .expect(200);
    const linea = detalle.body.items[0];
    expect(Number(linea.unitCost)).toBe(44000);
    expect(Number(linea.lineTotal) - Number(linea.unitCost)).toBe(7000);
    // El frasco salió al producir: la venta no lo descuenta otra vez.
    expect(await stockDe(frascoVariant, bodegaInsumos)).toBe(89);
  }, 60000);

  it('las que salen malas al producir se dan de baja en el mismo acto', async () => {
    const antes = await stockDe(locionVariant, bodegaVenta);
    await request(app.getHttpServer())
      .post('/api/production/entrada-de-terminado')
      .set(h())
      .send({ variantId: locionVariant, cantidad: 5, averiadas: 2 })
      .expect(201);
    expect(await stockDe(locionVariant, bodegaVenta)).toBe(antes + 3);
    expect(await stockDe(frascoVariant, bodegaInsumos)).toBe(84);
  }, 60000);
});
