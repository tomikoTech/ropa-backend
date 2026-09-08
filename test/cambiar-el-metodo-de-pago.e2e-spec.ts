import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { setupTestApp, loginAsAdmin, teardownTestApp } from './helpers/setup';

/**
 * **Corregir con qué se pagó una venta que ya está hecha.**
 *
 * «La última fue en efectivo por error, tenía que ser a crédito.» Hasta ahora
 * la única salida era anular la factura y volver a hacerla: el método de pago
 * no vive en la venta —vive en la fila del pago, o en la cuenta por cobrar
 * cuando es a crédito— y la edición de la venta no toca ninguna de las dos.
 *
 * Lo que se comprueba acá es que el cambio sea **cierto**: que la plata deje de
 * estar donde no entró y aparezca donde sí, sin tocar la mercancía ni el total.
 */
describe('Cambiar el método de pago de una venta (e2e)', () => {
  let app: INestApplication;
  let token: string;
  const ts = Date.now();
  const auth = () => ({ Authorization: `Bearer ${token}` });

  let variantId: string;
  let warehouseId: string;
  let clientId: string;
  let saleId: string;
  const TOTAL = 100000;

  const venta = async () => {
    const r = await request(app.getHttpServer())
      .get(`/api/pos/sales/${saleId}`)
      .set(auth())
      .expect(200);
    return r.body as {
      total: string;
      isPaid: boolean;
      payments: { method: string; amount: string }[];
      accountsReceivable: {
        id: string;
        totalAmount: string;
        paidAmount: string;
      }[];
      items: { quantity: number }[];
    };
  };

  beforeAll(async () => {
    app = await setupTestApp();
    token = await loginAsAdmin(app);

    const wh = await request(app.getHttpServer())
      .post('/api/inventory/warehouses')
      .set(auth())
      .send({
        name: `E2E Metodo WH ${ts}`,
        code: `MP-${ts.toString().slice(-5)}`,
        isPosLocation: true,
      })
      .expect(201);
    warehouseId = wh.body.id;

    const prod = await request(app.getHttpServer())
      .post('/api/products')
      .set(auth())
      .send({
        name: `E2EMP Producto ${ts}`,
        basePrice: TOTAL,
        costPrice: 40000,
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
        quantity: 20,
        movementType: 'IN',
        notes: 'E2E método de pago',
      })
      .expect(201);

    const cliente = await request(app.getHttpServer())
      .post('/api/clients')
      .set(auth())
      .send({
        firstName: 'Metodo',
        lastName: `Depago ${ts}`,
        phone: `31${ts.toString().slice(-8)}`,
      })
      .expect(201);
    clientId = cliente.body.id;
  }, 120000);

  afterAll(async () => {
    await teardownTestApp();
  });

  it('se vende en efectivo', async () => {
    const r = await request(app.getHttpServer())
      .post('/api/pos/sales')
      .set(auth())
      .send({
        clientId,
        warehouseId,
        items: [{ variantId, quantity: 1, unitPrice: TOTAL }],
        payments: [{ method: 'EFECTIVO', amount: TOTAL }],
      })
      .expect(201);
    saleId = r.body.id;

    const v = await venta();
    expect(v.payments).toHaveLength(1);
    expect(v.payments[0].method).toBe('EFECTIVO');
  }, 60000);

  it('pasarla a transferencia solo cambia la fila del pago', async () => {
    await request(app.getHttpServer())
      .post(`/api/pos/sales/${saleId}/metodo-de-pago`)
      .set(auth())
      .send({ method: 'TRANSFERENCIA', reference: 'ABC-123' })
      .expect(201);

    const v = await venta();
    expect(v.payments).toHaveLength(1);
    expect(v.payments[0].method).toBe('TRANSFERENCIA');
    // Ni la mercancía ni el total se mueven: solo dónde entró la plata.
    expect(Number(v.total)).toBe(TOTAL);
    expect(v.items).toHaveLength(1);
    expect(v.accountsReceivable ?? []).toHaveLength(0);
  }, 60000);

  it('a crédito borra el pago y abre la deuda', async () => {
    await request(app.getHttpServer())
      .post(`/api/pos/sales/${saleId}/metodo-de-pago`)
      .set(auth())
      .send({ method: 'CREDITO', creditDueDate: '2026-12-31', clientId })
      .expect(201);

    const v = await venta();
    // La plata nunca entró: no puede seguir sumando al banco ni al cuadre.
    expect(v.payments).toHaveLength(0);
    expect(v.accountsReceivable).toHaveLength(1);
    expect(Number(v.accountsReceivable[0].totalAmount)).toBe(TOTAL);
    expect(Number(v.accountsReceivable[0].paidAmount)).toBe(0);
    expect(Number(v.total)).toBe(TOTAL);
  }, 60000);

  it('sin fecha de vencimiento no pasa a crédito', async () => {
    // Una venta en efectivo aparte: la de arriba ya tiene fecha, y sin esto la
    // prueba pasaría por no haber nada que cambiar.
    const otra = await request(app.getHttpServer())
      .post('/api/pos/sales')
      .set(auth())
      .send({
        clientId,
        warehouseId,
        items: [{ variantId, quantity: 1, unitPrice: TOTAL }],
        payments: [{ method: 'EFECTIVO', amount: TOTAL }],
      })
      .expect(201);

    const r = await request(app.getHttpServer())
      .post(`/api/pos/sales/${otra.body.id}/metodo-de-pago`)
      .set(auth())
      .send({ method: 'CREDITO' })
      .expect(400);
    expect(r.body.message).toContain('vencimiento');

    // Y la venta se queda como estaba: una negativa no deja nada a medias.
    const sinTocar = await request(app.getHttpServer())
      .get(`/api/pos/sales/${otra.body.id}`)
      .set(auth())
      .expect(200);
    expect(sinTocar.body.payments).toHaveLength(1);
    expect(sinTocar.body.payments[0].method).toBe('EFECTIVO');
  }, 60000);

  it('volverla a efectivo salda la cartera y cobra', async () => {
    await request(app.getHttpServer())
      .post(`/api/pos/sales/${saleId}/metodo-de-pago`)
      .set(auth())
      .send({ method: 'EFECTIVO' })
      .expect(201);

    const v = await venta();
    expect(v.payments).toHaveLength(1);
    expect(v.payments[0].method).toBe('EFECTIVO');
    expect(Number(v.payments[0].amount)).toBe(TOTAL);
    // La cuenta queda, saldada, para que la deuda no reaparezca en cartera.
    expect(Number(v.accountsReceivable[0].totalAmount)).toBe(0);
    expect(v.isPaid).toBe(true);
  }, 60000);

  it('una venta con abonos no se saca del crédito', async () => {
    // Otra venta, esta sí a crédito de nacimiento y con un abono encima.
    const r = await request(app.getHttpServer())
      .post('/api/pos/sales')
      .set(auth())
      .send({
        clientId,
        warehouseId,
        items: [{ variantId, quantity: 1, unitPrice: TOTAL }],
        payments: [{ method: 'CREDITO', amount: TOTAL }],
        creditDueDate: '2026-12-31',
      })
      .expect(201);
    const conAbono = r.body.id as string;

    const detalle = await request(app.getHttpServer())
      .get(`/api/pos/sales/${conAbono}`)
      .set(auth())
      .expect(200);
    const arId = detalle.body.accountsReceivable[0].id as string;

    await request(app.getHttpServer())
      .post(`/api/pos/accounts-receivable/${arId}/payment`)
      .set(auth())
      .send({ amount: 30000, method: 'EFECTIVO' })
      .expect(201);

    const negativa = await request(app.getHttpServer())
      .post(`/api/pos/sales/${conAbono}/metodo-de-pago`)
      .set(auth())
      .send({ method: 'EFECTIVO' })
      .expect(400);
    expect(negativa.body.message).toContain('abonos');
    expect(negativa.body.message).toContain('$30.000');
  }, 60000);
});
