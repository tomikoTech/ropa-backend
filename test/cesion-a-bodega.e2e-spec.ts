import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { setupTestApp, loginAsAdmin, teardownTestApp } from './helpers/setup';

/**
 * **Ceder mercancía a otra bodega, y al revés.**
 *
 * «Que la bodega principal le preste a otra bodega u otro local dentro del
 * mismo sistema (…) y que sirva bidireccional: local presta a bodega principal
 * o viceversa.»
 *
 * La cesión **no es un traslado**. El traslado cambia de dueño: la mercancía
 * llega, se recibe y se acabó. La cesión deja una deuda de mercancía abierta:
 * lo que se venda se convierte en venta, lo que no, se devuelve.
 *
 * Lo que esta prueba cuida es que el inventario cuadre en las dos puntas, que
 * es donde una cesión mal hecha se nota tarde: en el conteo físico.
 */
describe('Cesión a bodega (e2e)', () => {
  let app: INestApplication;
  let token: string;
  const ts = Date.now();
  const auth = () => ({ Authorization: `Bearer ${token}` });

  let productId: string;
  let variantId: string;
  let principal: string;
  let local: string;
  let cesionId: string;

  const stockEn = async (warehouseId: string) => {
    const r = await request(app.getHttpServer())
      .get(`/api/inventory/stock?productId=${productId}`)
      .set(auth())
      .expect(200);
    const filas = (r.body.data ?? r.body) as {
      variantId: string;
      warehouseId: string;
      quantity: number | string;
    }[];
    return filas
      .filter((f) => f.variantId === variantId && f.warehouseId === warehouseId)
      .reduce((s, f) => s + Number(f.quantity), 0);
  };

  const crearBodega = async (nombre: string, sufijo: string) => {
    const r = await request(app.getHttpServer())
      .post('/api/inventory/warehouses')
      .set(auth())
      .send({ name: `${nombre} ${ts}`, code: `${sufijo}-${ts.toString().slice(-5)}` })
      .expect(201);
    return r.body.id as string;
  };

  beforeAll(async () => {
    app = await setupTestApp();
    token = await loginAsAdmin(app);

    principal = await crearBodega('E2E Cesion Principal', 'CP');
    local = await crearBodega('E2E Cesion Local', 'CL');

    const prod = await request(app.getHttpServer())
      .post('/api/products')
      .set(auth())
      .send({
        name: `E2ECESION Producto ${ts}`,
        basePrice: 20000,
        costPrice: 8000,
        variants: [{ size: 'U', color: 'Negro' }],
      })
      .expect(201);
    productId = prod.body.id;
    variantId = prod.body.variants[0].id;

    await request(app.getHttpServer())
      .post('/api/inventory/adjust')
      .set(auth())
      .send({
        variantId,
        warehouseId: principal,
        quantity: 50,
        movementType: 'IN',
        notes: 'Carga inicial de la prueba',
      })
      .expect((r) => {
        if (r.status !== 200 && r.status !== 201) {
          throw new Error(`No se pudo cargar stock: ${r.status} ${r.text}`);
        }
      });
  }, 180000);

  afterAll(async () => {
    await teardownTestApp();
  });

  it('la principal le cede diez pares al local', async () => {
    const antes = await stockEn(principal);

    const r = await request(app.getHttpServer())
      .post('/api/street/dispatches')
      .set(auth())
      .send({
        destinoTipo: 'BODEGA',
        destinoWarehouseId: local,
        warehouseId: principal,
        items: [{ variantId, quantity: 10, unitPrice: 20000 }],
      })
      .expect(201);

    cesionId = r.body.id;
    expect(r.body.dispatchNumber).toBeTruthy();
    // Sale del origen: la mercancía está afuera, prestada.
    expect(await stockEn(principal)).toBe(antes - 10);
  }, 60000);

  it('la mercancía cedida NO entra al stock del local', async () => {
    // Es la diferencia con un traslado. Sigue siendo del origen: vuelve como
    // plata o como devolución, y por eso no se puede vender por el POS del
    // local. Si se quiere que la venda él, eso es un traslado.
    expect(await stockEn(local)).toBe(0);
  }, 60000);

  it('una bodega no se puede ceder a sí misma', async () => {
    const r = await request(app.getHttpServer())
      .post('/api/street/dispatches')
      .set(auth())
      .send({
        destinoTipo: 'BODEGA',
        destinoWarehouseId: principal,
        warehouseId: principal,
        items: [{ variantId, quantity: 1, unitPrice: 20000 }],
      })
      .expect(400);
    expect(r.body.message).toContain('no pueden ser la misma');
  }, 60000);

  it('sin destino elegido, lo dice', async () => {
    const r = await request(app.getHttpServer())
      .post('/api/street/dispatches')
      .set(auth())
      .send({
        destinoTipo: 'BODEGA',
        warehouseId: principal,
        items: [{ variantId, quantity: 1, unitPrice: 20000 }],
      })
      .expect(400);
    expect(r.body.message).toContain('Elige a qué bodega');
  }, 60000);

  it('al cuadrar: lo vendido se vuelve venta y lo devuelto vuelve al origen', async () => {
    const antesPrincipal = await stockEn(principal);

    const detalle = await request(app.getHttpServer())
      .get(`/api/street/dispatches/${cesionId}`)
      .set(auth())
      .expect(200);
    const itemId = detalle.body.items[0].id;

    const r = await request(app.getHttpServer())
      .post(`/api/street/dispatches/${cesionId}/settle`)
      .set(auth())
      .send({ items: [{ itemId, sold: 6, returned: 4 }] })
      .expect(201);

    // Los cuatro que no se vendieron vuelven a la bodega que los prestó.
    expect(await stockEn(principal)).toBe(antesPrincipal + 4);
    // Y lo vendido es una venta de verdad, no una nota en un reporte.
    expect(r.body.saleId ?? r.body.sale?.id).toBeTruthy();
  }, 60000);

  it('y al revés: el local le cede a la principal', async () => {
    // «Sirve bidireccional». Es el mismo formulario con origen y destino
    // cambiados: no hay un camino especial para cada sentido.
    await request(app.getHttpServer())
      .post('/api/inventory/adjust')
      .set(auth())
      .send({
        variantId,
        warehouseId: local,
        quantity: 5,
        movementType: 'IN',
        notes: 'Para ceder de vuelta',
      })
      .expect((r) => {
        if (r.status !== 200 && r.status !== 201) {
          throw new Error(`No se pudo cargar stock: ${r.status} ${r.text}`);
        }
      });

    const antesLocal = await stockEn(local);
    await request(app.getHttpServer())
      .post('/api/street/dispatches')
      .set(auth())
      .send({
        destinoTipo: 'BODEGA',
        destinoWarehouseId: principal,
        warehouseId: local,
        items: [{ variantId, quantity: 3, unitPrice: 20000 }],
      })
      .expect(201);

    expect(await stockEn(local)).toBe(antesLocal - 3);
  }, 60000);

  it('el reporte agrupa por destino, sea persona o bodega', async () => {
    const r = await request(app.getHttpServer())
      .get('/api/street/report')
      .set(auth())
      .expect(200);
    const filas = (r.body.filas ?? r.body.rows ?? []) as {
      destinoId: string;
      destinoNombre: string;
    }[];
    // Debe aparecer el local como destino, con su nombre y no vacío.
    const delLocal = filas.find((f) => f.destinoId === local);
    expect(delLocal).toBeDefined();
    expect(delLocal!.destinoNombre).toContain('E2E Cesion Local');
  }, 60000);
});
