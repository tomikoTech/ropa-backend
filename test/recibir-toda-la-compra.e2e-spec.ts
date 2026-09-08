import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { setupTestApp, loginAsAdmin, teardownTestApp } from './helpers/setup';

/**
 * Recibir una compra entera de una vez.
 *
 * Renglón por renglón son cuarenta diálogos en una importación. Lo que no puede
 * pasar por ir rápido: que el costo entre **sin los fletes** —el recibo de a uno
 * los manda desde la pantalla— ni que un renglón que falla se lleve por delante
 * a los que sí se pudieron recibir.
 */
describe('Recibir toda la compra de una vez (e2e)', () => {
  let app: INestApplication;
  let token: string;
  const ts = Date.now();
  const auth = () => ({ Authorization: `Bearer ${token}` });

  let orderId: string;
  let warehouseId: string;

  beforeAll(async () => {
    app = await setupTestApp();
    token = await loginAsAdmin(app);

    const wh = await request(app.getHttpServer())
      .post('/api/inventory/warehouses')
      .set(auth())
      .send({
        name: `E2E Todo WH ${ts}`,
        code: `TD-${ts.toString().slice(-5)}`,
        isPosLocation: true,
      })
      .expect(201);
    warehouseId = wh.body.id;

    const sup = await request(app.getHttpServer())
      .post('/api/suppliers')
      .set(auth())
      .send({ name: `E2E Todo Prov ${ts}`, nit: `903${ts.toString().slice(-6)}-1` })
      .expect(201);

    const orden = await request(app.getHttpServer())
      .post('/api/purchases')
      .set(auth())
      .send({ supplierId: sup.body.id, warehouseId, items: [] })
      .expect(201);
    orderId = orden.body.id;

    // Tres renglones distintos, para que «de una vez» signifique algo.
    for (let i = 0; i < 3; i++) {
      const prod = await request(app.getHttpServer())
        .post('/api/products')
        .set(auth())
        .send({
          name: `E2E Todo Producto ${i} ${ts}`,
          basePrice: 100000,
          costPrice: 40000,
          variants: [{ size: 'U', color: 'Negro' }],
        })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/purchases/${orderId}/box-lines`)
        .set(auth())
        .send({
          productId: prod.body.id,
          boxes: 2,
          unitsPerBox: 12,
          unitCost: 100,
        })
        .expect(201);
    }

    // Un flete: es lo que distingue el costo del proveedor del puesto en bodega.
    await request(app.getHttpServer())
      .patch(`/api/purchases/${orderId}/import-costs`)
      .set(auth())
      .send({ freightCosts: [{ label: 'Naviera', amount: 7200 }] })
      .expect(200);
  }, 120000);

  afterAll(async () => {
    await teardownTestApp();
  });

  it('recibe los tres renglones de un golpe', async () => {
    const r = await request(app.getHttpServer())
      .post(`/api/stock-units/receive-all/${orderId}`)
      .set(auth())
      .send({})
      .expect(201);
    expect(r.body.renglones).toBe(3);
    expect(r.body.cajas).toBe(6);
    expect(r.body.unidades).toBe(72);
    expect(r.body.fallos).toEqual([]);
  }, 90000);

  it('las cajas entran con el costo puesto en bodega, no con el del proveedor', async () => {
    // 7.200 de flete entre 72 unidades son 100 por unidad: el costo tiene que
    // ser 200, no los 100 que cobró el proveedor. Recibir rápido no puede
    // significar recibir mal.
    const lineas = await request(app.getHttpServer())
      .get(`/api/purchases/${orderId}/box-lines`)
      .set(auth())
      .expect(200);
    const unidades = await request(app.getHttpServer())
      .get(`/api/stock-units?boxLineId=${lineas.body[0].id}`)
      .set(auth())
      .expect(200);
    expect(unidades.body.length).toBeGreaterThan(0);
    for (const u of unidades.body as { cost: string }[]) {
      expect(Number(u.cost)).toBeGreaterThan(100);
    }
  }, 60000);

  it('una compra ya recibida lo dice, en vez de no hacer nada en silencio', async () => {
    const r = await request(app.getHttpServer())
      .post(`/api/stock-units/receive-all/${orderId}`)
      .set(auth())
      .send({})
      .expect(400);
    expect(String(r.body.message)).toMatch(/ya está recibida/i);
  }, 60000);

  it('y el inventario queda cuadrado', async () => {
    const r = await request(app.getHttpServer())
      .get('/api/inventory/integridad')
      .set(auth())
      .expect(200);
    const mios = (r.body.descuadres as { sku: string }[]).filter((d) =>
      d.sku?.includes('E2ETOD'),
    );
    expect(mios).toEqual([]);
  }, 60000);
});
