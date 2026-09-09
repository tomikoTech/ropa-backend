import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { setupTestApp, loginAsAdmin, teardownTestApp } from './helpers/setup';

/**
 * **El punto de venta no necesita el inventario entero para saber cuánto hay.**
 *
 * `GET /inventory/stock` devolvía cada fila con su variante, su producto y su
 * bodega anidados —dos mil bytes para leer tres campos—, y el punto de venta lo
 * pide completo en cada carga y en cada cambio de bodega. En una tienda con
 * 2.400 renglones eso son casi cinco megas por pantalla: la espera de cuatro
 * segundos que reportaba el mostrador.
 *
 * Lo que se comprueba acá es que el modo resumido diga **lo mismo** —las
 * mismas cantidades— con una fracción del peso.
 */
describe('Existencias resumidas para el punto de venta (e2e)', () => {
  let app: INestApplication;
  let token: string;
  const ts = Date.now();
  const auth = () => ({ Authorization: `Bearer ${token}` });

  let variantId: string;
  let warehouseId: string;

  beforeAll(async () => {
    app = await setupTestApp();
    token = await loginAsAdmin(app);

    const wh = await request(app.getHttpServer())
      .post('/api/inventory/warehouses')
      .set(auth())
      .send({
        name: `E2E Resumen WH ${ts}`,
        code: `RS-${ts.toString().slice(-5)}`,
        isPosLocation: true,
      })
      .expect(201);
    warehouseId = wh.body.id;

    const prod = await request(app.getHttpServer())
      .post('/api/products')
      .set(auth())
      .send({
        name: `E2ERES Producto ${ts}`,
        basePrice: 100000,
        variants: [{ size: 'U', color: 'Negro' }],
      })
      .expect(201);
    variantId = prod.body.variants[0].id;

    await request(app.getHttpServer())
      .post('/api/inventory/adjust')
      .set(auth())
      .send({
        variantId,
        warehouseId,
        quantity: 7,
        movementType: 'IN',
        notes: 'E2E resumen',
      })
      .expect(201);
  }, 120000);

  afterAll(async () => {
    await teardownTestApp();
  });

  it('dice la misma cantidad que la respuesta completa', async () => {
    const completa = await request(app.getHttpServer())
      .get('/api/inventory/stock')
      .set(auth())
      .expect(200);
    const resumida = await request(app.getHttpServer())
      .get('/api/inventory/stock?resumido=1')
      .set(auth())
      .expect(200);

    const mia = (filas: { variantId: string; quantity: number | string }[]) =>
      filas
        .filter((f) => f.variantId === variantId)
        .reduce((suma, f) => suma + Number(f.quantity), 0);

    expect(mia(resumida.body)).toBe(7);
    expect(mia(resumida.body)).toBe(mia(completa.body));
  }, 60000);

  it('trae tres campos y nada más', async () => {
    const r = await request(app.getHttpServer())
      .get('/api/inventory/stock?resumido=1')
      .set(auth())
      .expect(200);

    const fila = (r.body as Record<string, unknown>[]).find(
      (f) => f.variantId === variantId,
    )!;
    expect(Object.keys(fila).sort()).toEqual([
      'quantity',
      'variantId',
      'warehouseId',
    ]);
    // Lo que pesaba: la variante y la bodega enteras dentro de cada fila.
    expect(fila.variant).toBeUndefined();
    expect(fila.warehouse).toBeUndefined();
  }, 60000);

  it('pesa una fracción de lo que pesaba', async () => {
    const completa = await request(app.getHttpServer())
      .get('/api/inventory/stock')
      .set(auth())
      .expect(200);
    const resumida = await request(app.getHttpServer())
      .get('/api/inventory/stock?resumido=1')
      .set(auth())
      .expect(200);

    const pesoCompleta = JSON.stringify(completa.body).length;
    const pesoResumida = JSON.stringify(resumida.body).length;
    expect(pesoResumida * 5).toBeLessThan(pesoCompleta);
  }, 60000);

  it('por bodega también, y solo esa bodega', async () => {
    const r = await request(app.getHttpServer())
      .get(`/api/inventory/stock/warehouse/${warehouseId}?resumido=1`)
      .set(auth())
      .expect(200);

    const filas = r.body as { warehouseId: string; quantity: number }[];
    expect(filas.length).toBeGreaterThan(0);
    expect(filas.every((f) => f.warehouseId === warehouseId)).toBe(true);
  }, 60000);
});
