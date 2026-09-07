import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { setupTestApp, loginAsAdmin, teardownTestApp } from './helpers/setup';

/**
 * Dos órdenes distintas no pueden emitir el MISMO código de barras.
 *
 * El código es `AAMMDD | orden(4) | renglón(3) | bulto(3)`, y el tramo «orden»
 * sale de los últimos cuatro dígitos del número de orden —que hoy es
 * `OC-AAAAMMDD-0001`, o sea un consecutivo **que reinicia cada día**—. Dos
 * órdenes de días distintos pueden ser las dos la «0001»; si se reciben el
 * mismo día, sus renglones número 1 pedían el mismo código y la recepción se
 * caía con «Ya existe un registro con ese código de barras».
 */
describe('Códigos de bulto: dos órdenes no chocan (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let dataSource: DataSource;
  const ts = Date.now();
  const auth = () => ({ Authorization: `Bearer ${token}` });

  let productId: string;
  let warehouseId: string;
  let supplierId: string;

  const crearOrden = async () => {
    const r = await request(app.getHttpServer())
      .post('/api/purchases')
      .set(auth())
      .send({ supplierId, warehouseId, items: [] })
      .expect(201);
    return r.body.id as string;
  };

  const agregarRenglon = async (orderId: string) => {
    const r = await request(app.getHttpServer())
      .post(`/api/purchases/${orderId}/box-lines`)
      .set(auth())
      .send({ productId, boxes: 2, unitsPerBox: 24, unitCost: 100 })
      .expect(201);
    expect(r.body.consecutive).toBe(1);
    return r.body.id as string;
  };

  const recibir = (lineId: string, boxes = 1) =>
    request(app.getHttpServer())
      .post(`/api/stock-units/receive/${lineId}`)
      .set(auth())
      .send({ boxes, warehouseId });

  beforeAll(async () => {
    app = await setupTestApp();
    token = await loginAsAdmin(app);
    dataSource = app.get(DataSource);

    const wh = await request(app.getHttpServer())
      .post('/api/inventory/warehouses')
      .set(auth())
      .send({ name: `E2E Choque WH ${ts}`, code: `CH-${ts.toString().slice(-5)}` })
      .expect(201);
    warehouseId = wh.body.id;

    const sup = await request(app.getHttpServer())
      .post('/api/suppliers')
      .set(auth())
      .send({ name: `E2E Choque Prov ${ts}`, nit: `902${ts.toString().slice(-6)}-1` })
      .expect(201);
    supplierId = sup.body.id;

    const prod = await request(app.getHttpServer())
      .post('/api/products')
      .set(auth())
      .send({
        name: `E2E Choque Producto ${ts}`,
        basePrice: 100000,
        costPrice: 50000,
        variants: [{ size: 'U', color: 'Negro' }],
      })
      .expect(201);
    productId = prod.body.id;
  }, 90000);

  afterAll(async () => {
    await teardownTestApp();
  });

  it('dos órdenes con el mismo consecutivo (de días distintos) se reciben hoy sin chocar', async () => {
    const ordenA = await crearOrden();
    const ordenB = await crearOrden();

    // Se le pone a las dos el mismo consecutivo de cuatro dígitos, como pasa
    // de verdad: la «0001» de ayer y la «0001» de hoy.
    const consecutivo = String(ts).slice(-4);
    await dataSource.query(
      `UPDATE purchase_orders SET order_number = $2 WHERE id = $1`,
      [ordenA, `OC-20260906-${consecutivo}`],
    );
    await dataSource.query(
      `UPDATE purchase_orders SET order_number = $2 WHERE id = $1`,
      [ordenB, `OC-20260907-${consecutivo}`],
    );

    const lineaA = await agregarRenglon(ordenA);
    const lineaB = await agregarRenglon(ordenB);

    const a = await recibir(lineaA);
    expect(a.status).toBe(201);

    const b = await recibir(lineaB);
    // Antes: 409 «Ya existe un registro con ese código de barras».
    expect(b.status).toBe(201);

    const codigos = [...a.body, ...b.body].map(
      (u: { barcode: string }) => u.barcode,
    );
    expect(new Set(codigos).size).toBe(codigos.length);
  }, 60000);

  it('recibir el resto del mismo renglón sigue la numeración, no la reinicia', async () => {
    const orden = await crearOrden();
    const linea = await agregarRenglon(orden);

    const primera = await recibir(linea, 1);
    expect(primera.status).toBe(201);
    const segunda = await recibir(linea, 1);
    expect(segunda.status).toBe(201);

    const codigos = [...primera.body, ...segunda.body].map(
      (u: { barcode: string }) => u.barcode,
    );
    expect(new Set(codigos).size).toBe(2);
  }, 60000);
});
