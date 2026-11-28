import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { setupTestApp, loginAsAdmin, teardownTestApp } from './helpers/setup';

/**
 * Dos pedidos de Andrés (AMAWAD, 2026-11-25):
 *
 * - «Necesito poder modificar las fechas de pago de las facturas»: el plazo
 *   salía solo y no había cómo moverlo.
 * - «El sistema me dice que hay algo que no se le cargó precio de costo, pero
 *   no me deja verlo»: el balance contaba las ventas sin costo sin decir
 *   cuáles. Ahora las lista y deja cargarles el costo actual del producto.
 */
describe('Fecha de pago y ventas sin costo (e2e)', () => {
  let app: INestApplication;
  let token: string;
  const ts = Date.now();
  const h = () => ({ Authorization: `Bearer ${token}` });
  let warehouseId: string;
  let productId: string;
  let variantId: string;
  let clientId: string;
  let arId: string;
  let saleId: string;
  const hoy = new Date().toLocaleDateString('en-CA', {
    timeZone: 'America/Bogota',
  });

  beforeAll(async () => {
    app = await setupTestApp();
    token = await loginAsAdmin(app);
    const wh = await request(app.getHttpServer())
      .post('/api/inventory/warehouses')
      .set(h())
      .send({
        name: `E2E VC WH ${ts}`,
        code: `VC-${ts.toString().slice(-5)}`,
        isPosLocation: true,
      })
      .expect(201);
    warehouseId = wh.body.id;
    // Sin costo: así nace el producto que deja la venta fuera de la ganancia.
    const p = await request(app.getHttpServer())
      .post('/api/products')
      .set(h())
      .send({
        name: `E2EVC producto ${ts}`,
        basePrice: 10000,
        variants: [{ size: 'U', color: 'Único' }],
      })
      .expect(201);
    productId = p.body.id;
    variantId = p.body.variants[0].id;
    await request(app.getHttpServer())
      .post('/api/inventory/adjust')
      .set(h())
      .send({
        variantId,
        warehouseId,
        quantity: 5,
        movementType: 'IN',
        notes: 'e2e',
      })
      .expect((r) => {
        if (r.status !== 200 && r.status !== 201) throw new Error(r.text);
      });
    const c = await request(app.getHttpServer())
      .post('/api/clients')
      .set(h())
      .send({
        firstName: 'LUZ',
        lastName: `PLAZO ${ts}`,
        phone: `312${ts.toString().slice(-7)}`,
      })
      .expect(201);
    clientId = c.body.id;
    const venta = await request(app.getHttpServer())
      .post('/api/pos/sales')
      .set(h())
      .send({
        clientId,
        warehouseId,
        items: [{ variantId, quantity: 2, unitPrice: 50000 }],
        payments: [{ method: 'CREDITO', amount: 100000 }],
        creditDueDate: '2027-02-22',
      })
      .expect(201);
    saleId = venta.body.id;
    const d = await request(app.getHttpServer())
      .get(`/api/pos/sales/${saleId}`)
      .set(h())
      .expect(200);
    arId = d.body.accountsReceivable[0].id;
  }, 120000);

  afterAll(async () => {
    await teardownTestApp();
  });

  it('cambia la fecha de pago de una factura a crédito, sin correrla un día', async () => {
    const r = await request(app.getHttpServer())
      .patch(`/api/pos/accounts-receivable/${arId}/vencimiento`)
      .set(h())
      .send({ dueDate: '2027-03-15' })
      .expect(200);
    expect(String(r.body.dueDate).slice(0, 10)).toBe('2027-03-15');

    const cuenta = await request(app.getHttpServer())
      .get(`/api/pos/accounts-receivable/${arId}`)
      .set(h())
      .expect(200);
    expect(String(cuenta.body.dueDate).slice(0, 10)).toBe('2027-03-15');
  });

  it('no deja una fecha de pago anterior a la factura ni una fecha mal escrita', async () => {
    const antes = await request(app.getHttpServer())
      .patch(`/api/pos/accounts-receivable/${arId}/vencimiento`)
      .set(h())
      .send({ dueDate: '2020-01-01' })
      .expect(400);
    expect(antes.body.message).toMatch(/anterior a la factura/);
    await request(app.getHttpServer())
      .patch(`/api/pos/accounts-receivable/${arId}/vencimiento`)
      .set(h())
      .send({ dueDate: '15/03/2027' })
      .expect(400);
  });

  it('corre la fecha de pago de una factura del proveedor sin editar la compra', async () => {
    const prov = await request(app.getHttpServer())
      .post('/api/suppliers')
      .set(h())
      .send({
        name: `E2E VC Prov ${ts}`,
        nit: `904${ts.toString().slice(-6)}-1`,
      })
      .expect(201);
    // Sin plazo: nace con el vencimiento asumido y su nota.
    const compra = await request(app.getHttpServer())
      .post('/api/purchases')
      .set(h())
      .send({
        supplierId: prov.body.id,
        warehouseId,
        items: [{ variantId, quantityOrdered: 3, unitCost: 10_000 }],
      })
      .expect(201);
    const apId = compra.body.accountsPayable[0].id as string;

    const r = await request(app.getHttpServer())
      .patch(`/api/purchases/accounts-payable/${apId}/vencimiento`)
      .set(h())
      .send({ dueDate: '2027-04-30' })
      .expect(200);
    expect(String(r.body.dueDate).slice(0, 10)).toBe('2027-04-30');
    expect(r.body.notes ?? null).toBeNull();
    expect(r.body.purchaseOrder.supplier.id).toBe(prov.body.id);

    const antes = await request(app.getHttpServer())
      .patch(`/api/purchases/accounts-payable/${apId}/vencimiento`)
      .set(h())
      .send({ dueDate: '2020-01-01' })
      .expect(400);
    expect(antes.body.message).toMatch(/anterior a la factura/);

    // Pagada, ya no hay fecha que mover.
    await request(app.getHttpServer())
      .post(`/api/purchases/accounts-payable/${apId}/pay`)
      .set(h())
      .send({})
      .expect((x) => {
        if (x.status !== 200 && x.status !== 201) throw new Error(x.text);
      });
    const pagada = await request(app.getHttpServer())
      .patch(`/api/purchases/accounts-payable/${apId}/vencimiento`)
      .set(h())
      .send({ dueDate: '2027-05-30' })
      .expect(400);
    expect(pagada.body.message).toMatch(/ya está pagada/);
  });

  it('el encargado con rol «Administrador» también puede; el colaborador sin rol, no', async () => {
    // Así entran los encargados de AMAWAD: COLABORADOR con el rol de acceso
    // «Administrador». El botón no les salía y el servidor los habría frenado.
    const rol = await request(app.getHttpServer())
      .post('/api/access/roles')
      .set(h())
      .send({ name: `Administrador VC ${ts}`, templateKey: 'administrador' })
      .expect(201);
    const crear = async (sufijo: string) => {
      const email = `vc-${sufijo}-${ts}@e2e.co`;
      const password = 'Clave-e2e-123';
      const u = await request(app.getHttpServer())
        .post('/api/users')
        .set(h())
        .send({
          email,
          password,
          firstName: 'E2E',
          lastName: sufijo,
          role: 'COLABORADOR',
        })
        .expect(201);
      return { id: u.body.id as string, email, password };
    };
    const login = async (email: string, password: string) =>
      (
        await request(app.getHttpServer())
          .post('/api/auth/login')
          .send({ email, password })
          .expect(201)
      ).body.accessToken as string;

    const encargado = await crear('encargado');
    await request(app.getHttpServer())
      .patch(`/api/access/users/${encargado.id}`)
      .set(h())
      .send({ accessRoleId: rol.body.id })
      .expect(200);
    const tEncargado = await login(encargado.email, encargado.password);
    const r = await request(app.getHttpServer())
      .patch(`/api/pos/accounts-receivable/${arId}/vencimiento`)
      .set({ Authorization: `Bearer ${tEncargado}` })
      .send({ dueDate: '2027-03-20' })
      .expect(200);
    expect(String(r.body.dueDate).slice(0, 10)).toBe('2027-03-20');

    const suelto = await crear('suelto');
    const tSuelto = await login(suelto.email, suelto.password);
    await request(app.getHttpServer())
      .patch(`/api/pos/accounts-receivable/${arId}/vencimiento`)
      .set({ Authorization: `Bearer ${tSuelto}` })
      .send({ dueDate: '2027-03-25' })
      .expect(403);
  });

  it('dice qué línea no tiene costo y le carga el costo actual del producto', async () => {
    const lista = async () =>
      (
        await request(app.getHttpServer())
          .get(
            `/api/reports/balance/sin-costo?from=${hoy}&to=${hoy}&warehouseId=${warehouseId}`,
          )
          .set(h())
          .expect(200)
      ).body as {
        saleId: string;
        saleItemId: string;
        costoActual: number;
        referencia: string;
        cantidad: number;
      }[];

    const sinCosto = (await lista()).filter((l) => l.saleId === saleId);
    expect(sinCosto).toHaveLength(1);
    expect(sinCosto[0].costoActual).toBe(0);
    expect(sinCosto[0].cantidad).toBe(2);

    // Sin costo en el producto no se carga nada: no se inventa un costo.
    const nada = await request(app.getHttpServer())
      .post('/api/reports/balance/sin-costo/cargar')
      .set(h())
      .send({ saleItemIds: [sinCosto[0].saleItemId] })
      .expect(201);
    expect(nada.body).toEqual({ cargadas: 0, sinCostoEnElProducto: 1 });

    await request(app.getHttpServer())
      .patch(`/api/products/${productId}`)
      .set(h())
      .send({ costPrice: 30000 })
      .expect(200);
    expect((await lista()).find((l) => l.saleId === saleId)?.costoActual).toBe(
      30000,
    );

    const cargado = await request(app.getHttpServer())
      .post('/api/reports/balance/sin-costo/cargar')
      .set(h())
      .send({ saleItemIds: [sinCosto[0].saleItemId] })
      .expect(201);
    expect(cargado.body.cargadas).toBe(1);
    expect((await lista()).some((l) => l.saleId === saleId)).toBe(false);

    const balance = await request(app.getHttpServer())
      .get(
        `/api/reports/balance?from=${hoy}&to=${hoy}&warehouseId=${warehouseId}`,
      )
      .set(h())
      .expect(200);
    expect(balance.body.ventasSinCosto).toBe(0);
    // 2 pares a 30.000 de costo: 60.000 de recuperación, en centavos.
    expect(balance.body.recuperacion).toBe(6_000_000);
  });
});
