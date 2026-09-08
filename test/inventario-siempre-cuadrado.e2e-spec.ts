import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { setupTestApp, loginAsAdmin, teardownTestApp } from './helpers/setup';

/**
 * **Ninguna operación puede dejar el inventario descuadrado.**
 *
 * El sistema ya comprobaba el cuadre después de cada movimiento… y lo escribía
 * en un `log.warn`, que es donde nadie mira. Los tres bugs que descuadraron una
 * tienda —el reparto contando una caja de 24 como un bulto, el emparejamiento
 * que perdía líneas repetidas, y el saldo que quedaba en negativo— pasaron por
 * ahí sin que nada los frenara.
 *
 * Esta prueba le pone dientes a esa comprobación: recorre los caminos que
 * mueven inventario y exige que al final **el agregado y las etiquetas digan lo
 * mismo**. Si mañana alguien vuelve a contar una caja como uno, esto lo caza
 * antes de que llegue a una tienda.
 */
describe('El inventario queda cuadrado después de cada operación (e2e)', () => {
  let app: INestApplication;
  let token: string;
  const ts = Date.now();
  const auth = () => ({ Authorization: `Bearer ${token}` });

  let productId: string;
  let variantId: string;
  let warehouseId: string;
  let cajas: { id: string; barcode: string }[] = [];
  let saleId: string;

  /** Los descuadres de ESTE producto: los históricos de la tienda no son cosa nuestra. */
  const descuadresDelProducto = async () => {
    const r = await request(app.getHttpServer())
      .get('/api/inventory/integridad')
      .set(auth())
      .expect(200);
    return (
      r.body.descuadres as { sku: string; agregado: number; etiquetadas: number }[]
    ).filter((d) => d.sku?.startsWith(`E2ECUA`));
  };

  beforeAll(async () => {
    app = await setupTestApp();
    token = await loginAsAdmin(app);

    const wh = await request(app.getHttpServer())
      .post('/api/inventory/warehouses')
      .set(auth())
      .send({
        name: `E2E Cuadre WH ${ts}`,
        code: `CU-${ts.toString().slice(-5)}`,
        isPosLocation: true,
      })
      .expect(201);
    warehouseId = wh.body.id;

    const prod = await request(app.getHttpServer())
      .post('/api/products')
      .set(auth())
      .send({
        // El SKU empieza por E2ECUA: es como se filtran los descuadres propios.
        name: `E2ECUA Producto ${ts}`,
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
    expect(cajas).toHaveLength(3);
  }, 120000);

  afterAll(async () => {
    await teardownTestApp();
  });

  it('después de ingresar cajas, cuadra', async () => {
    expect(await descuadresDelProducto()).toEqual([]);
  });

  it('después de vender dos cajas, cuadra', async () => {
    const venta = await request(app.getHttpServer())
      .post('/api/pos/sales')
      .set(auth())
      .send({
        warehouseId,
        items: cajas.slice(0, 2).map((c) => ({
          variantId,
          quantity: 24,
          unitPrice: 100000,
          stockUnitId: c.id,
        })),
        payments: [{ method: 'EFECTIVO', amount: 4800000 }],
      })
      .expect(201);
    saleId = venta.body.id;
    expect(await descuadresDelProducto()).toEqual([]);
  }, 60000);

  it('después de AGREGAR una caja a la venta, cuadra', async () => {
    // El camino que descuadró la tienda: la tercera caja entra sin `previous`,
    // y el reparto la contaba como un bulto en vez de como 24 unidades.
    await request(app.getHttpServer())
      .patch(`/api/pos/sales/${saleId}`)
      .set(auth())
      .send({
        items: cajas.map((c) => ({
          variantId,
          quantity: 24,
          unitPrice: 100000,
          stockUnitIds: [c.id],
        })),
      })
      .expect(200);
    expect(await descuadresDelProducto()).toEqual([]);
  }, 60000);

  it('después de QUITAR una caja de la venta, cuadra', async () => {
    await request(app.getHttpServer())
      .patch(`/api/pos/sales/${saleId}`)
      .set(auth())
      .send({
        items: cajas.slice(0, 2).map((c) => ({
          variantId,
          quantity: 24,
          unitPrice: 100000,
          stockUnitIds: [c.id],
        })),
      })
      .expect(200);
    expect(await descuadresDelProducto()).toEqual([]);
  }, 60000);

  it('después de ANULAR la venta, cuadra y vuelve todo a la bodega', async () => {
    await request(app.getHttpServer())
      .post(`/api/pos/sales/${saleId}/cancel`)
      .set(auth())
      .send({})
      .expect(201);
    expect(await descuadresDelProducto()).toEqual([]);
  }, 60000);

  it('y el saldo nunca quedó en negativo', async () => {
    // Contra la base, y solo de ESTA variante: el endpoint devuelve más filas
    // y los saldos viejos de la tienda no son cosa de esta prueba.
    const filas: { quantity: string }[] = await app
      .get(DataSource)
      .query(`SELECT quantity FROM stock WHERE variant_id = $1`, [variantId]);
    expect(filas.length).toBeGreaterThan(0);
    for (const fila of filas) {
      expect(Number(fila.quantity)).toBeGreaterThanOrEqual(0);
    }
  });
});
