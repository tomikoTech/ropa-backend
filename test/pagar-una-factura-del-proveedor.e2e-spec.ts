import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { setupTestApp, loginAsAdmin, teardownTestApp } from './helpers/setup';

/**
 * **La factura del proveedor, vista y pagada desde ella misma.**
 *
 * Cuentas por cobrar ya tenía su pantalla por factura —saldo, abonar,
 * deshacer—; la de pagar no: el detalle era un modal sin botón y para abonar
 * había que encontrar la fila en la tabla. Esto cubre lo que esa pantalla
 * necesita del servidor:
 *
 *  - traer **una** cuenta por pagar con sus pagos;
 *  - que el pago a una sola factura guarde el banco y quién pagó, igual que
 *    el pago repartido;
 *  - deshacer un pago con su contra-pago, sin borrar nada.
 */
describe('Pagar una factura del proveedor (e2e)', () => {
  let app: INestApplication;
  let token: string;
  const ts = Date.now();
  const auth = () => ({ Authorization: `Bearer ${token}` });

  let supplierId: string;
  let warehouseId: string;
  let variantId: string;
  let bankId: string;
  let apId: string;

  const cuenta = async () =>
    (
      await request(app.getHttpServer())
        .get(`/api/purchases/accounts-payable/${apId}`)
        .set(auth())
        .expect(200)
    ).body as {
      id: string;
      amount: string;
      paidAmount: string;
      isPaid: boolean;
      paidAt: string | null;
      purchaseOrder: { id: string; supplier: { id: string } };
      payments: {
        id: string;
        amount: string;
        bankId: string | null;
        userId: string | null;
        reversesPaymentId: string | null;
      }[];
    };

  beforeAll(async () => {
    app = await setupTestApp();
    token = await loginAsAdmin(app);

    const prov = await request(app.getHttpServer())
      .post('/api/suppliers')
      .set(auth())
      .send({
        name: `E2E Una Factura ${ts}`,
        nit: `903${ts.toString().slice(-6)}-1`,
      })
      .expect(201);
    supplierId = prov.body.id;

    const wh = await request(app.getHttpServer())
      .post('/api/inventory/warehouses')
      .set(auth())
      .send({
        name: `E2E Una Factura WH ${ts}`,
        code: `UF-${ts.toString().slice(-5)}`,
      })
      .expect(201);
    warehouseId = wh.body.id;

    const prod = await request(app.getHttpServer())
      .post('/api/products')
      .set(auth())
      .send({
        name: `E2EUNAF Producto ${ts}`,
        basePrice: 50000,
        costPrice: 25000,
        variants: [{ size: 'U', color: 'Negro' }],
      })
      .expect(201);
    variantId = prod.body.variants[0].id;

    const banco = await request(app.getHttpServer())
      .post('/api/banks')
      .set(auth())
      .send({ name: `E2E Banco ${ts}` })
      .expect(201);
    bankId = banco.body.id;

    // Una compra de 100.000.
    const compra = await request(app.getHttpServer())
      .post('/api/purchases')
      .set(auth())
      .send({
        supplierId,
        warehouseId,
        items: [{ variantId, quantityOrdered: 10, unitCost: 10_000 }],
        paymentDueDate: '2026-12-31',
      })
      .expect(201);
    apId = compra.body.accountsPayable[0].id;
  }, 180000);

  afterAll(async () => {
    await teardownTestApp();
  });

  it('trae la cuenta con su compra, su proveedor y sin pagos', async () => {
    const c = await cuenta();
    expect(c.id).toBe(apId);
    expect(Number(c.amount)).toBe(100_000);
    expect(c.purchaseOrder.supplier.id).toBe(supplierId);
    expect(c.payments).toHaveLength(0);
  });

  it('una cuenta que no existe es un 404, no un 500', async () => {
    await request(app.getHttpServer())
      .get(
        '/api/purchases/accounts-payable/00000000-0000-4000-8000-000000000000',
      )
      .set(auth())
      .expect(404);
  });

  it('el pago a una factura guarda el banco y quién pagó', async () => {
    const r = await request(app.getHttpServer())
      .post(`/api/purchases/accounts-payable/${apId}/payment`)
      .set(auth())
      .send({
        amount: 40_000,
        method: 'TRANSFERENCIA',
        bankId,
        reference: 'E2E-UNA-1',
      })
      .expect(201);

    expect(Number(r.body.paidAmount)).toBe(40_000);
    expect(r.body.isPaid).toBe(false);
    const pago = r.body.payments[0];
    expect(pago.bankId).toBe(bankId);
    // Antes quedaba en null: el historial decía que no pagó nadie.
    expect(pago.userId).toBeTruthy();
  });

  it('no deja pagar más que el saldo', async () => {
    await request(app.getHttpServer())
      .post(`/api/purchases/accounts-payable/${apId}/payment`)
      .set(auth())
      .send({ amount: 60_001, method: 'EFECTIVO' })
      .expect(400);
  });

  it('un pago en cero se rechaza', async () => {
    await request(app.getHttpServer())
      .post(`/api/purchases/accounts-payable/${apId}/payment`)
      .set(auth())
      .send({ amount: 0, method: 'EFECTIVO' })
      .expect(400);
  });

  it('saldar la factura la marca pagada', async () => {
    await request(app.getHttpServer())
      .post(`/api/purchases/accounts-payable/${apId}/payment`)
      .set(auth())
      .send({ amount: 60_000, method: 'EFECTIVO' })
      .expect(201);
    const c = await cuenta();
    expect(Number(c.paidAmount)).toBe(100_000);
    expect(c.isPaid).toBe(true);
    expect(c.paidAt).toBeTruthy();
  });

  it('deshacer un pago lo compensa en negativo y reabre la factura', async () => {
    const antes = await cuenta();
    const deEfectivo = antes.payments.find((p) => Number(p.amount) === 60_000)!;

    const r = await request(app.getHttpServer())
      .post(
        `/api/purchases/accounts-payable/${apId}/payment/${deEfectivo.id}/reverse`,
      )
      .set(auth())
      .send({ motivo: 'Se digitó en la factura equivocada' })
      .expect(201);

    expect(Number(r.body.paidAmount)).toBe(40_000);
    expect(r.body.isPaid).toBe(false);
    expect(r.body.paidAt).toBeNull();
    // No se borra: el original sigue y aparece su contra-pago.
    expect(r.body.payments).toHaveLength(3);
    const contra = (
      r.body.payments as { amount: string; reversesPaymentId: string | null }[]
    ).find((p) => p.reversesPaymentId === deEfectivo.id)!;
    expect(Number(contra.amount)).toBe(-60_000);
  });

  it('el mismo pago no se deshace dos veces, ni el contra-pago', async () => {
    const c = await cuenta();
    const original = c.payments.find((p) => Number(p.amount) === 60_000)!;
    const contra = c.payments.find((p) => p.reversesPaymentId === original.id)!;

    const dos = await request(app.getHttpServer())
      .post(
        `/api/purchases/accounts-payable/${apId}/payment/${original.id}/reverse`,
      )
      .set(auth())
      .send({})
      .expect(400);
    expect(dos.body.message).toMatch(/ya fue reversado/i);

    const delContra = await request(app.getHttpServer())
      .post(
        `/api/purchases/accounts-payable/${apId}/payment/${contra.id}/reverse`,
      )
      .set(auth())
      .send({})
      .expect(400);
    // El mensaje habla de pagos, no de abonos: es la cartera del otro lado.
    expect(delContra.body.message).toMatch(/pago nuevo/i);
  });

  it('el historial de pagos muestra el contra-pago atado a su original', async () => {
    const r = await request(app.getHttpServer())
      .get(`/api/cartera/pagos?cuentaId=${apId}`)
      .set(auth())
      .expect(200);
    const renglones = (
      r.body.dias as {
        renglones: {
          reversaDe: string | null;
          esReverso: boolean;
          anulado: boolean;
        }[];
      }[]
    ).flatMap((d) => d.renglones);
    // El contra-pago apunta al original, y el original queda anulado: antes
    // la columna no existía y el pago deshecho se habría sumado como vivo.
    expect(renglones.some((a) => a.reversaDe && a.esReverso)).toBe(true);
    expect(renglones.some((a) => a.anulado)).toBe(true);
  });

  it('después de deshacer, se puede volver a pagar el saldo', async () => {
    await request(app.getHttpServer())
      .post(`/api/purchases/accounts-payable/${apId}/payment`)
      .set(auth())
      .send({ amount: 60_000, method: 'EFECTIVO' })
      .expect(201);
    const c = await cuenta();
    expect(c.isPaid).toBe(true);
    expect(Number(c.paidAmount)).toBe(100_000);
  });
});
