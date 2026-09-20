import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { setupTestApp, loginAsAdmin, teardownTestApp } from './helpers/setup';

/**
 * **El historial de abonos: cuándo se abonó y cuánto.**
 *
 * Lo pidió la tienda: el saldo ya se veía, pero para saber cómo se llegó a él
 * había que abrir factura por factura. Acá se fija el relato de las dos
 * carteras —lo que nos abonaron y lo que pagamos— y las tres cosas que lo
 * hacen confiable: que cada renglón diga a qué factura entró y quién lo
 * recibió, que el abono deshecho se vea **pero no sume**, y que filtrar por un
 * tercero no traiga los de otro.
 */
describe('Historial de abonos (e2e)', () => {
  let app: INestApplication;
  let token: string;
  const ts = Date.now();
  const auth = () => ({ Authorization: `Bearer ${token}` });

  let clientId: string;
  let otroClienteId: string;
  let warehouseId: string;
  let variantId: string;
  let supplierId: string;
  /** La venta a crédito del cliente de la prueba. */
  let arId: string;
  let numeroDeLaFactura: string;

  const renglonesDe = (body: { dias: { renglones: unknown[] }[] }) =>
    body.dias.flatMap((d) => d.renglones) as Record<string, unknown>[];

  const venderACredito = async (cliente: string, monto: number) => {
    const r = await request(app.getHttpServer())
      .post('/api/pos/sales')
      .set(auth())
      .send({
        clientId: cliente,
        warehouseId,
        items: [{ variantId, quantity: 1, unitPrice: monto }],
        payments: [{ method: 'CREDITO', amount: monto }],
        creditDueDate: '2026-12-31',
      })
      .expect(201);
    const detalle = await request(app.getHttpServer())
      .get(`/api/pos/sales/${r.body.id}`)
      .set(auth())
      .expect(200);
    return {
      arId: detalle.body.accountsReceivable[0].id as string,
      numero: (detalle.body.invoiceNumber ||
        detalle.body.saleNumber) as string,
    };
  };

  beforeAll(async () => {
    app = await setupTestApp();
    token = await loginAsAdmin(app);

    const cliente = async (nombre: string, doc: string) => {
      const r = await request(app.getHttpServer())
        .post('/api/clients')
        .set(auth())
        .send({
          firstName: 'E2E Historial',
          lastName: nombre,
          documentNumber: doc,
        })
        .expect(201);
      return r.body.id as string;
    };
    clientId = await cliente(`Cliente ${ts}`, `HIST-${ts}`);
    otroClienteId = await cliente(`Otro ${ts}`, `HIST2-${ts}`);

    const wh = await request(app.getHttpServer())
      .post('/api/inventory/warehouses')
      .set(auth())
      .send({
        name: `E2E Historial WH ${ts}`,
        code: `HI-${ts.toString().slice(-5)}`,
        isPosLocation: true,
      })
      .expect(201);
    warehouseId = wh.body.id;

    const prod = await request(app.getHttpServer())
      .post('/api/products')
      .set(auth())
      .send({
        name: `E2EHIST Producto ${ts}`,
        basePrice: 100000,
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
        quantity: 50,
        movementType: 'IN',
        notes: 'Carga inicial de la prueba',
      })
      .expect((r) => {
        if (r.status !== 200 && r.status !== 201) {
          throw new Error(`No se pudo cargar stock: ${r.status} ${r.text}`);
        }
      });

    const venta = await venderACredito(clientId, 300_000);
    arId = venta.arId;
    numeroDeLaFactura = venta.numero;

    const prov = await request(app.getHttpServer())
      .post('/api/suppliers')
      .set(auth())
      .send({
        name: `E2E Historial Proveedor ${ts}`,
        nit: `903${ts.toString().slice(-6)}-1`,
      })
      .expect(201);
    supplierId = prov.body.id;
  }, 180000);

  afterAll(async () => {
    await teardownTestApp();
  });

  it('cada abono queda con su monto, su método, su factura y quién lo recibió', async () => {
    await request(app.getHttpServer())
      .post(`/api/pos/accounts-receivable/${arId}/payment`)
      .set(auth())
      .send({ amount: 50_000, method: 'EFECTIVO', notes: 'Abonó en el local' })
      .expect(201);

    const r = await request(app.getHttpServer())
      .get(`/api/cartera/abonos?clienteId=${clientId}`)
      .set(auth())
      .expect(200);

    const renglones = renglonesDe(r.body);
    expect(renglones).toHaveLength(1);
    expect(renglones[0]).toMatchObject({
      centavos: 5_000_000,
      metodo: 'EFECTIVO',
      documento: numeroDeLaFactura,
      nota: 'Abonó en el local',
      anulado: false,
      esReverso: false,
    });
    // Quién lo recibió: sin esto, «¿quién cobró esto?» sigue sin respuesta.
    expect(renglones[0].quien).toBeTruthy();
    expect(renglones[0].terceroId).toBe(clientId);
  }, 60000);

  it('los del día van juntos y el resumen separa por método', async () => {
    await request(app.getHttpServer())
      .post(`/api/pos/accounts-receivable/${arId}/payment`)
      .set(auth())
      .send({ amount: 30_000, method: 'TRANSFERENCIA', reference: 'NEQUI-1' })
      .expect(201);

    const r = await request(app.getHttpServer())
      .get(`/api/cartera/abonos?clienteId=${clientId}`)
      .set(auth())
      .expect(200);

    expect(r.body.dias).toHaveLength(1);
    expect(r.body.resumen.centavos).toBe(8_000_000);
    expect(r.body.resumen.cuantos).toBe(2);
    expect(r.body.resumen.terceros).toBe(1);
    expect(
      (r.body.resumen.porMetodo as { metodo: string; centavos: number }[]).map(
        (m) => [m.metodo, m.centavos],
      ),
    ).toEqual([
      ['EFECTIVO', 5_000_000],
      ['TRANSFERENCIA', 3_000_000],
    ]);
    // Lo último arriba: es como se lee «¿qué me abonaron hoy?».
    expect(renglonesDe(r.body)[0].metodo).toBe('TRANSFERENCIA');
  }, 60000);

  it('el abono deshecho se ve con su contra-abono, pero no suma', async () => {
    const abonos = await request(app.getHttpServer())
      .get(`/api/cartera/abonos?clienteId=${clientId}`)
      .set(auth())
      .expect(200);
    const transferencia = renglonesDe(abonos.body).find(
      (x) => x.metodo === 'TRANSFERENCIA',
    )!;

    await request(app.getHttpServer())
      .post(
        `/api/pos/accounts-receivable/${arId}/payment/${transferencia.id as string}/reverse`,
      )
      .set(auth())
      .send({ motivo: 'La transferencia no llegó' })
      .expect(201);

    const r = await request(app.getHttpServer())
      .get(`/api/cartera/abonos?clienteId=${clientId}`)
      .set(auth())
      .expect(200);

    const renglones = renglonesDe(r.body);
    // Los tres renglones se ven —un abono no se borra— pero el neto vuelve a
    // ser lo que de verdad entró.
    expect(renglones).toHaveLength(3);
    expect(renglones.find((x) => x.id === transferencia.id)).toMatchObject({
      anulado: true,
    });
    expect(renglones.some((x) => x.esReverso === true)).toBe(true);
    expect(r.body.resumen.centavos).toBe(5_000_000);
    expect(r.body.resumen.cuantos).toBe(1);
    expect(r.body.resumen.anulados).toBe(1);
  }, 60000);

  it('filtrar por un cliente no trae los abonos de otro', async () => {
    const otra = await venderACredito(otroClienteId, 100_000);
    await request(app.getHttpServer())
      .post(`/api/pos/accounts-receivable/${otra.arId}/payment`)
      .set(auth())
      .send({ amount: 10_000, method: 'EFECTIVO' })
      .expect(201);

    const mios = await request(app.getHttpServer())
      .get(`/api/cartera/abonos?clienteId=${clientId}`)
      .set(auth())
      .expect(200);
    expect(
      renglonesDe(mios.body).every((x) => x.terceroId === clientId),
    ).toBe(true);

    // Sin filtro aparecen los dos: es la pantalla de «lo que entró hoy».
    const todos = await request(app.getHttpServer())
      .get('/api/cartera/abonos')
      .set(auth())
      .expect(200);
    const terceros = new Set(renglonesDe(todos.body).map((x) => x.terceroId));
    expect(terceros.has(clientId)).toBe(true);
    expect(terceros.has(otroClienteId)).toBe(true);
  }, 60000);

  it('el abono al saldo repartido entre facturas cuenta como un abono', async () => {
    // Quien abona al saldo paga una vez y el servidor lo aplica de la factura
    // más vieja a la más nueva: por dentro son dos renglones, pero fue un
    // abono. Contarlos aparte mostraba una cobranza que no ocurrió.
    const tercerCliente = await request(app.getHttpServer())
      .post('/api/clients')
      .set(auth())
      .send({
        firstName: 'E2E Historial',
        lastName: `Reparto ${ts}`,
        documentNumber: `HIST3-${ts}`,
      })
      .expect(201);
    const id = tercerCliente.body.id as string;
    await venderACredito(id, 100_000);
    await venderACredito(id, 100_000);

    await request(app.getHttpServer())
      .post(`/api/pos/accounts-receivable/clients/${id}/balance-payment`)
      .set(auth())
      .send({ amount: 150_000, method: 'EFECTIVO' })
      .expect(201);

    const r = await request(app.getHttpServer())
      .get(`/api/cartera/abonos?clienteId=${id}`)
      .set(auth())
      .expect(200);

    // Dos renglones —uno por factura— pero un solo abono y el total completo.
    expect(renglonesDe(r.body)).toHaveLength(2);
    expect(r.body.resumen.cuantos).toBe(1);
    expect(r.body.resumen.centavos).toBe(15_000_000);
    const lotes = new Set(renglonesDe(r.body).map((x) => x.loteId));
    expect(lotes.size).toBe(1);
    expect([...lotes][0]).toBeTruthy();
  }, 60000);

  it('un periodo sin abonos responde vacío, no en error', async () => {
    // El caso de entrar un lunes festivo: cero, con su cero en el total.
    const r = await request(app.getHttpServer())
      .get('/api/cartera/abonos?desde=2020-01-01&hasta=2020-01-31')
      .set(auth())
      .expect(200);
    expect(r.body.dias).toEqual([]);
    expect(r.body.resumen.centavos).toBe(0);
    expect(r.body.desde).toBe('2020-01-01');
    expect(r.body.hasta).toBe('2020-01-31');
  }, 60000);

  it('del otro lado: lo que se le pagó al proveedor, con su factura', async () => {
    const compra = await request(app.getHttpServer())
      .post('/api/purchases')
      .set(auth())
      .send({
        supplierId,
        warehouseId,
        items: [{ variantId, quantityOrdered: 10, unitCost: 20_000 }],
        paymentDueDate: '2026-12-31',
        supplierInvoiceNumber: `FP-${ts}`,
      })
      .expect(201);
    const apId = compra.body.accountsPayable[0].id as string;

    await request(app.getHttpServer())
      .post(`/api/purchases/accounts-payable/${apId}/payment`)
      .set(auth())
      .send({ amount: 80_000, method: 'TRANSFERENCIA', reference: 'BANCO-9' })
      .expect(201);

    const r = await request(app.getHttpServer())
      .get(`/api/cartera/pagos?proveedorId=${supplierId}`)
      .set(auth())
      .expect(200);

    const renglones = renglonesDe(r.body);
    expect(renglones).toHaveLength(1);
    expect(renglones[0]).toMatchObject({
      centavos: 8_000_000,
      metodo: 'TRANSFERENCIA',
      documento: `FP-${ts}`,
      referencia: 'BANCO-9',
      terceroId: supplierId,
    });
    expect(renglones[0].terceroNombre).toContain('E2E Historial Proveedor');
    expect(r.body.resumen.centavos).toBe(8_000_000);
  }, 60000);
});
