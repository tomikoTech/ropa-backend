import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { setupTestApp, loginAsAdmin, teardownTestApp } from './helpers/setup';

/**
 * **Cobrar de un solo paso.**
 *
 * «Que apenas yo pistolee ya se arme la venta». El modo rápido del POS elige la
 * forma de pago en el panel y cierra la venta sin diálogo, así que lo que llega
 * acá es **una sola llamada con el total exacto**: sin vueltas, con el método
 * ya decidido.
 *
 * Esta prueba fija ese contrato: que esa llamada baste, que el inventario
 * baje, que el método quede escrito y que el servidor siga frenando lo que el
 * modo rápido no puede resolver solo (un crédito sin fecha).
 *
 * La regla de **cuándo** el POS puede saltarse el diálogo vive en el frontend
 * (`venta-de-un-paso.ts`) y se prueba allá: acá se prueba que la llamada que
 * produce funcione.
 */
describe('Venta de un solo paso (e2e)', () => {
  let app: INestApplication;
  let token: string;
  const ts = Date.now();
  const auth = () => ({ Authorization: `Bearer ${token}` });

  let productId: string;
  let variantId: string;
  let warehouseId: string;

  /**
   * El stock de ESTA variante en ESTA bodega.
   *
   * El endpoint solo filtra por `productId`; `variantId` y `warehouseId` los
   * ignora. Pasárselos igual y sumar lo que devuelva da el inventario entero
   * de la tienda, y entonces cualquier otra prueba que venda algo al mismo
   * tiempo tumba esta. (Pasó: 47.190 en vez de 47.177.)
   */
  const stockActual = async () => {
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

  beforeAll(async () => {
    app = await setupTestApp();
    token = await loginAsAdmin(app);

    const wh = await request(app.getHttpServer())
      .post('/api/inventory/warehouses')
      .set(auth())
      .send({
        name: `E2E Rapida WH ${ts}`,
        code: `RA-${ts.toString().slice(-5)}`,
        isPosLocation: true,
      })
      .expect(201);
    warehouseId = wh.body.id;

    const prod = await request(app.getHttpServer())
      .post('/api/products')
      .set(auth())
      .send({
        name: `E2ERAPI Producto ${ts}`,
        basePrice: 30000,
        costPrice: 12000,
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
        warehouseId,
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

  it('una sola llamada con el total exacto cierra la venta y baja el stock', async () => {
    const antes = await stockActual();

    const venta = await request(app.getHttpServer())
      .post('/api/pos/sales')
      .set(auth())
      .send({
        warehouseId,
        items: [{ variantId, quantity: 2, unitPrice: 30000 }],
        // Exacto: en modo rápido no hay vueltas que calcular.
        payments: [
          { method: 'EFECTIVO', amount: 60000, receivedAmount: 60000 },
        ],
      })
      .expect(201);

    expect(Number(venta.body.total)).toBe(60_000);
    expect(await stockActual()).toBe(antes - 2);
  }, 60000);

  it('el método elegido en el panel queda escrito en la venta', async () => {
    // Lo que se elige antes de cobrar tiene que llegar hasta la fila de pagos:
    // si no, el cuadre del día no distingue el efectivo de la transferencia.
    const venta = await request(app.getHttpServer())
      .post('/api/pos/sales')
      .set(auth())
      .send({
        warehouseId,
        items: [{ variantId, quantity: 1, unitPrice: 30000 }],
        payments: [
          { method: 'TRANSFERENCIA', amount: 30000, reference: 'E2E-RAP' },
        ],
      })
      .expect(201);

    const detalle = await request(app.getHttpServer())
      .get(`/api/pos/sales/${venta.body.id}`)
      .set(auth())
      .expect(200);
    expect(detalle.body.payments).toHaveLength(1);
    expect(detalle.body.payments[0].method).toBe('TRANSFERENCIA');
  }, 60000);

  it('sin vueltas: lo recibido es lo exacto, no queda cambio colgando', async () => {
    const venta = await request(app.getHttpServer())
      .post('/api/pos/sales')
      .set(auth())
      .send({
        warehouseId,
        items: [{ variantId, quantity: 1, unitPrice: 30000 }],
        payments: [
          { method: 'EFECTIVO', amount: 30000, receivedAmount: 30000 },
        ],
      })
      .expect(201);

    const detalle = await request(app.getHttpServer())
      .get(`/api/pos/sales/${venta.body.id}`)
      .set(auth())
      .expect(200);
    const pago = detalle.body.payments[0];
    expect(Number(pago.receivedAmount) - Number(pago.amount)).toBe(0);
  }, 60000);

  it('y el servidor sigue frenando lo que el modo rápido no resuelve solo', async () => {
    // Un crédito sin fecha de vencimiento. Por eso el crédito nunca se cierra
    // de un paso en el POS: hay algo que preguntar.
    const r = await request(app.getHttpServer())
      .post('/api/pos/sales')
      .set(auth())
      .send({
        warehouseId,
        items: [{ variantId, quantity: 1, unitPrice: 30000 }],
        payments: [{ method: 'CREDITO', amount: 30000 }],
      })
      .expect(400);
    expect(r.body.message).toMatch(/cliente registrado|fecha de vencimiento/i);
  }, 60000);
});
