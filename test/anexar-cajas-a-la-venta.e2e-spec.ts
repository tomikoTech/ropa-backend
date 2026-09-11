import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { setupTestApp, loginAsAdmin, teardownTestApp } from './helpers/setup';

/**
 * **Anexar una caja a una factura que ya tiene varias de la misma referencia.**
 *
 * Lo que pasó en AMAWAD el 11 de septiembre: una venta de cincuenta y tres
 * cajas iguales. Anexaron la cincuenta y cuatro y el servidor contestó siete
 * veces seguidas «el código 26091100020010347 ya no está disponible». Al
 * vendedor le tocó armar otra venta.
 *
 * Dos fallos encadenados, y el segundo causaba el primero:
 *
 *  1. La caja anexada se descontaba bien del inventario pero la línea se
 *     guardaba **sin su código**, sin `unitKind` y sin su contenido.
 *  2. Con eso, el emparejamiento de la siguiente edición —que iba por variante
 *     y cantidad— le entregaba a una línea el código de otra, y la otra moría
 *     pidiendo un código que ya había salido.
 *
 * Tres cajas de veinticuatro de la misma referencia bastan para reproducirlo:
 * con una sola, el emparejamiento por variante y cantidad nunca se equivoca.
 */
describe('Anexar cajas a una venta (e2e)', () => {
  let app: INestApplication;
  let token: string;
  const ts = Date.now();
  const auth = () => ({ Authorization: `Bearer ${token}` });

  let productId: string;
  let variantId: string;
  let warehouseId: string;
  let saleId: string;
  /** Cuatro cajas de 24, en un orden estable. */
  let cajas: { id: string; barcode: string }[] = [];

  const renglonesDeLaVenta = async () => {
    const r = await request(app.getHttpServer())
      .get(`/api/pos/sales/${saleId}`)
      .set(auth())
      .expect(200);
    return r.body.items as {
      quantity: number;
      stockUnitId: string | null;
      unitKind: string | null;
      unitPrice: number;
      variantId: string;
    }[];
  };

  const anexar = (masCajas: { id: string }[]) => {
    const items = [...cajas.slice(0, 2), ...masCajas].map((caja) => ({
      variantId,
      quantity: 24,
      unitPrice: 1000,
      stockUnitIds: [caja.id],
    }));
    return request(app.getHttpServer())
      .patch(`/api/pos/sales/${saleId}`)
      .set(auth())
      .send({ items });
  };

  beforeAll(async () => {
    app = await setupTestApp();
    token = await loginAsAdmin(app);

    const wh = await request(app.getHttpServer())
      .post('/api/inventory/warehouses')
      .set(auth())
      .send({
        name: `E2E Anexar WH ${ts}`,
        code: `AX-${ts.toString().slice(-5)}`,
        isPosLocation: true,
      })
      .expect(201);
    warehouseId = wh.body.id;

    const prod = await request(app.getHttpServer())
      .post('/api/products')
      .set(auth())
      .send({
        name: `E2EANEXA Producto ${ts}`,
        basePrice: 1000,
        costPrice: 400,
        variants: [{ size: 'U', color: 'Negro' }],
      })
      .expect(201);
    productId = prod.body.id;
    variantId = prod.body.variants[0].id;

    await request(app.getHttpServer())
      .post('/api/stock-units/intake')
      .set(auth())
      .send({ productId, boxes: 4, unitsPerBox: 24, warehouseId, unitCost: 400 })
      .expect(201);

    const encontrados = await request(app.getHttpServer())
      .get(`/api/stock-units/search?productId=${productId}&status=IN_STOCK&limit=10`)
      .set(auth())
      .expect(200);
    // Por código y no «las que vengan»: el orden de la respuesta no es parte
    // del contrato y una prueba que dependa de él miente cuando cambie.
    cajas = (encontrados.body.data as { id: string; barcode: string }[])
      .slice()
      .sort((a, b) => a.barcode.localeCompare(b.barcode));
    expect(cajas).toHaveLength(4);
  }, 180000);

  afterAll(async () => {
    await teardownTestApp();
  });

  it('la venta nace con dos cajas, cada una con su código', async () => {
    const venta = await request(app.getHttpServer())
      .post('/api/pos/sales')
      .set(auth())
      .send({
        warehouseId,
        items: [
          { variantId, quantity: 24, unitPrice: 1000, stockUnitId: cajas[0].id },
          { variantId, quantity: 24, unitPrice: 1000, stockUnitId: cajas[1].id },
        ],
        payments: [{ method: 'EFECTIVO', amount: 48000 }],
      })
      .expect(201);
    saleId = venta.body.id;

    const items = await renglonesDeLaVenta();
    expect(items.map((i) => i.stockUnitId).sort()).toEqual(
      [cajas[0].id, cajas[1].id].sort(),
    );
  }, 60000);

  it('anexar la tercera caja le deja SU código a la línea nueva', async () => {
    await anexar([cajas[2]]).expect(200);

    const items = await renglonesDeLaVenta();
    expect(items).toHaveLength(3);
    // Esto es lo que fallaba: la caja salía del inventario y la línea se
    // guardaba sin código. La factura ya no sabía qué se llevó el cliente.
    expect(items.map((i) => i.stockUnitId).sort()).toEqual(
      [cajas[0].id, cajas[1].id, cajas[2].id].sort(),
    );
    // Y sin `unitKind` la pantalla dejaba de verla como caja: la siguiente
    // edición la aplanaba en veinticuatro pares sueltos.
    expect(items.every((i) => i.unitKind === 'BOX')).toBe(true);
  }, 60000);

  it('y se puede anexar la cuarta: el código de una no se lo lleva otra', async () => {
    // El 400 del caso real —«ya no está disponible»— salía justo acá.
    await anexar([cajas[2], cajas[3]]).expect(200);

    const items = await renglonesDeLaVenta();
    expect(items).toHaveLength(4);
    expect(items.map((i) => i.stockUnitId).sort()).toEqual(
      cajas.map((c) => c.id).sort(),
    );
  }, 60000);

  it('reenviar la factura en otro orden no le quita el código a nadie', async () => {
    // El 400 literal del caso real. Con el emparejamiento viejo —por variante
    // y cantidad— la primera línea se quedaba con el código de la última, y la
    // última moría pidiendo un código que acababa de salir del inventario:
    // «el código … ya no está disponible», siete veces seguidas.
    const alReves = cajas
      .slice()
      .reverse()
      .map((caja) => ({
        variantId,
        quantity: 24,
        unitPrice: 1000,
        stockUnitIds: [caja.id],
      }));
    await request(app.getHttpServer())
      .patch(`/api/pos/sales/${saleId}`)
      .set(auth())
      .send({ items: alReves })
      .expect(200);

    const items = await renglonesDeLaVenta();
    expect(items.map((i) => i.stockUnitId).sort()).toEqual(
      cajas.map((c) => c.id).sort(),
    );
  }, 60000);

  it('las cuatro cajas quedan vendidas y ninguna suelta', async () => {
    const r = await request(app.getHttpServer())
      .get(`/api/stock-units/search?productId=${productId}&limit=20`)
      .set(auth())
      .expect(200);
    const estados = r.body.data as { id: string; status: string }[];
    expect(estados.filter((u) => u.status === 'SOLD')).toHaveLength(4);
  }, 60000);

  it('quitar una caja la devuelve al inventario y las otras conservan la suya', async () => {
    await request(app.getHttpServer())
      .patch(`/api/pos/sales/${saleId}`)
      .set(auth())
      .send({
        items: cajas.slice(0, 3).map((caja) => ({
          variantId,
          quantity: 24,
          unitPrice: 1000,
          stockUnitIds: [caja.id],
        })),
      })
      .expect(200);

    const items = await renglonesDeLaVenta();
    expect(items.map((i) => i.stockUnitId).sort()).toEqual(
      cajas.slice(0, 3).map((c) => c.id).sort(),
    );

    const r = await request(app.getHttpServer())
      .get(`/api/stock-units/search?productId=${productId}&limit=20`)
      .set(auth())
      .expect(200);
    const porId = Object.fromEntries(
      (r.body.data as { id: string; status: string }[]).map((u) => [u.id, u.status]),
    );
    expect(porId[cajas[3].id]).toBe('IN_STOCK');
  }, 60000);
});
