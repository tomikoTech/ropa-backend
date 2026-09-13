import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { setupTestApp, loginAsAdmin, teardownTestApp } from './helpers/setup';

/**
 * **Pagarle a un proveedor varias facturas de una sola vez.**
 *
 * Cobrar ya se podía así; pagar seguía siendo factura por factura, «y a veces
 * se demoraba mucho». Son las dos mitades del mismo problema y comparten la
 * aritmética (`common/cartera/repartir-abono.ts`).
 *
 * Dos formas, y la elección es del que paga:
 *
 *  - **Al saldo del proveedor**: «le abono un millón a Fulano» y se reparte
 *    desde la factura más vieja.
 *  - **A las facturas que yo marque**: puede estar saldando tres de las diez.
 *
 * Tres compras hacen falta para que el orden se note: con dos, un reparto al
 * revés se ve igual que uno correcto en la mitad de los casos.
 */
describe('Pagar varias facturas del proveedor (e2e)', () => {
  let app: INestApplication;
  let token: string;
  const ts = Date.now();
  const auth = () => ({ Authorization: `Bearer ${token}` });

  let supplierId: string;
  let otroProveedorId: string;
  let warehouseId: string;
  let variantId: string;

  /** Las tres compras, de la más vieja a la más nueva. */
  let cuentas: { apId: string; orderId: string; total: number }[] = [];

  const crearCompra = async (unitCost: number, cantidad: number) => {
    const r = await request(app.getHttpServer())
      .post('/api/purchases')
      .set(auth())
      .send({
        supplierId,
        warehouseId,
        items: [{ variantId, quantityOrdered: cantidad, unitCost }],
        paymentDueDate: '2026-12-31',
      })
      .expect(201);
    return {
      apId: r.body.accountsPayable[0].id as string,
      orderId: r.body.id as string,
      total: Number(r.body.total),
    };
  };

  const estadoDe = async (apId: string) => {
    const r = await request(app.getHttpServer())
      .get(`/api/purchases/accounts-payable?supplierId=${supplierId}&limit=200`)
      .set(auth())
      .expect(200);
    const ap = (r.body.data as Record<string, unknown>[]).find(
      (a) => a.id === apId,
    );
    if (!ap) throw new Error(`No apareció la cuenta ${apId}`);
    return {
      pagado: Number(ap.paidAmount),
      total: Number(ap.amount),
      saldada: !!ap.isPaid,
    };
  };

  beforeAll(async () => {
    app = await setupTestApp();
    token = await loginAsAdmin(app);

    const prov = await request(app.getHttpServer())
      .post('/api/suppliers')
      .set(auth())
      .send({
        name: `E2E Pagos Proveedor ${ts}`,
        nit: `901${ts.toString().slice(-6)}-1`,
      })
      .expect(201);
    supplierId = prov.body.id;

    const otro = await request(app.getHttpServer())
      .post('/api/suppliers')
      .set(auth())
      .send({
        name: `E2E Pagos Otro ${ts}`,
        nit: `902${ts.toString().slice(-6)}-1`,
      })
      .expect(201);
    otroProveedorId = otro.body.id;

    const wh = await request(app.getHttpServer())
      .post('/api/inventory/warehouses')
      .set(auth())
      .send({
        name: `E2E Pagos WH ${ts}`,
        code: `PG-${ts.toString().slice(-5)}`,
      })
      .expect(201);
    warehouseId = wh.body.id;

    const prod = await request(app.getHttpServer())
      .post('/api/products')
      .set(auth())
      .send({
        name: `E2EPAGO Producto ${ts}`,
        basePrice: 50000,
        costPrice: 25000,
        variants: [{ size: 'U', color: 'Negro' }],
      })
      .expect(201);
    variantId = prod.body.variants[0].id;

    // 100.000 · 200.000 · 300.000, creadas en ese orden.
    cuentas = [
      await crearCompra(10_000, 10),
      await crearCompra(20_000, 10),
      await crearCompra(30_000, 10),
    ];
  }, 180000);

  afterAll(async () => {
    await teardownTestApp();
  });

  it('un abono al saldo salda la primera y deja la segunda a medias', async () => {
    // 150.000 sobre una deuda de 600.000: salda la de 100.000 y le deja
    // 50.000 a la de 200.000. La tercera no se toca.
    const r = await request(app.getHttpServer())
      .post(`/api/purchases/accounts-payable/suppliers/${supplierId}/balance-payment`)
      .set(auth())
      .send({ amount: 150_000, method: 'TRANSFERENCIA', reference: 'E2E-1' })
      .expect(201);

    expect(r.body.allocations).toHaveLength(2);
    expect(r.body.allocations[0].accountsPayableId).toBe(cuentas[0].apId);
    expect(r.body.allocations[0].amount).toBe(100_000);
    expect(r.body.allocations[0].isFullyPaid).toBe(true);
    expect(r.body.allocations[1].accountsPayableId).toBe(cuentas[1].apId);
    expect(r.body.allocations[1].amount).toBe(50_000);
    expect(r.body.allocations[1].isFullyPaid).toBe(false);

    expect(await estadoDe(cuentas[0].apId)).toMatchObject({
      pagado: 100_000,
      saldada: true,
    });
    expect(await estadoDe(cuentas[1].apId)).toMatchObject({
      pagado: 50_000,
      saldada: false,
    });
    // La tercera, intacta: esto es lo que distingue un reparto de un reparto
    // al revés.
    expect(await estadoDe(cuentas[2].apId)).toMatchObject({
      pagado: 0,
      saldada: false,
    });
  }, 60000);

  it('los renglones de un mismo pago quedan atados por su lote', async () => {
    const r = await request(app.getHttpServer())
      .get(`/api/purchases/accounts-payable?supplierId=${supplierId}&limit=200`)
      .set(auth())
      .expect(200);
    const primera = (r.body.data as Record<string, unknown>[]).find(
      (a) => a.id === cuentas[0].apId,
    ) as { payments?: { allocationBatchId?: string | null }[] };
    const segunda = (r.body.data as Record<string, unknown>[]).find(
      (a) => a.id === cuentas[1].apId,
    ) as { payments?: { allocationBatchId?: string | null }[] };

    const lotePrimera = primera.payments?.[0]?.allocationBatchId;
    const loteSegunda = segunda.payments?.[0]?.allocationBatchId;
    // Sin esto, un pago repartido se ve como pagos sueltos sin relación.
    expect(lotePrimera).toBeTruthy();
    expect(loteSegunda).toBe(lotePrimera);
  }, 60000);

  it('el pago a facturas elegidas salta las que no se marcaron', async () => {
    // Se marca SOLO la tercera, teniendo la segunda con saldo abierto y más
    // vieja. Elegir es la instrucción: no se cuela el reparto por antigüedad.
    const r = await request(app.getHttpServer())
      .post('/api/purchases/accounts-payable/pay-batch')
      .set(auth())
      .send({
        accountIds: [cuentas[2].apId],
        amount: 300_000,
        method: 'EFECTIVO',
      })
      .expect(201);

    expect(r.body.allocations).toHaveLength(1);
    expect(r.body.allocations[0].accountsPayableId).toBe(cuentas[2].apId);
    expect(await estadoDe(cuentas[2].apId)).toMatchObject({ saldada: true });
    // La segunda sigue debiendo sus 150.000.
    expect(await estadoDe(cuentas[1].apId)).toMatchObject({
      pagado: 50_000,
      saldada: false,
    });
  }, 60000);

  it('no deja pagar más de lo que se debe', async () => {
    const r = await request(app.getHttpServer())
      .post(`/api/purchases/accounts-payable/suppliers/${supplierId}/balance-payment`)
      .set(auth())
      .send({ amount: 999_999_999 })
      .expect(400);
    expect(r.body.message).toContain('excede el saldo pendiente');

    // Y el rechazo no dejó nada a medias.
    expect(await estadoDe(cuentas[1].apId)).toMatchObject({ pagado: 50_000 });
  }, 60000);

  it('paga el saldo exacto y cierra la cuenta', async () => {
    await request(app.getHttpServer())
      .post(`/api/purchases/accounts-payable/suppliers/${supplierId}/balance-payment`)
      .set(auth())
      .send({ amount: 150_000 })
      .expect(201);
    expect(await estadoDe(cuentas[1].apId)).toMatchObject({
      pagado: 200_000,
      saldada: true,
    });
  }, 60000);

  it('un proveedor sin deuda lo dice en vez de aceptar la plata', async () => {
    const r = await request(app.getHttpServer())
      .post(`/api/purchases/accounts-payable/suppliers/${supplierId}/balance-payment`)
      .set(auth())
      .send({ amount: 10_000 })
      .expect(400);
    expect(r.body.message).toContain('no tiene saldo pendiente');
  }, 60000);

  it('tampoco acepta plata para un proveedor que nunca tuvo compras', async () => {
    await request(app.getHttpServer())
      .post(`/api/purchases/accounts-payable/suppliers/${otroProveedorId}/balance-payment`)
      .set(auth())
      .send({ amount: 10_000 })
      .expect(400);
  }, 60000);

  it('y no acepta una lista de facturas vacía', async () => {
    const r = await request(app.getHttpServer())
      .post('/api/purchases/accounts-payable/pay-batch')
      .set(auth())
      .send({ accountIds: [], amount: 10_000 })
      .expect(400);
    expect(r.body.message).toContain('No se eligió ninguna cuenta');
  }, 60000);
});
