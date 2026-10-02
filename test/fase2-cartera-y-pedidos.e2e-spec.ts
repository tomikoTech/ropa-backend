import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { setupTestApp, loginAsAdmin, teardownTestApp } from './helpers/setup';
import { crearTiendaDePerfumeria } from './helpers/perfumeria';

/**
 * **Fase 2, de punta a punta: cartera completa, recibo multi-factura y
 * pedidos que se vuelven venta.**
 */
describe('Cartera completa, recibos y pedidos (e2e)', () => {
  let app: INestApplication;
  let token: string;
  const ts = Date.now();
  const h = () => ({ Authorization: `Bearer ${token}` });
  let warehouseId: string;
  let variantId: string;
  let clientId: string;
  const cuentas: string[] = [];

  const fiar = async (precio: number) => {
    const r = await request(app.getHttpServer())
      .post('/api/pos/sales')
      .set(h())
      .send({
        clientId,
        warehouseId,
        items: [{ variantId, quantity: 1, unitPrice: precio }],
        payments: [{ method: 'CREDITO', amount: precio }],
        creditDueDate: '2026-09-01',
      })
      .expect(201);
    const d = await request(app.getHttpServer())
      .get(`/api/pos/sales/${r.body.id}`)
      .set(h())
      .expect(200);
    cuentas.push(d.body.accountsReceivable[0].id as string);
  };

  beforeAll(async () => {
    app = await setupTestApp();
    token = await loginAsAdmin(app);
    const wh = await request(app.getHttpServer())
      .post('/api/inventory/warehouses')
      .set(h())
      .send({
        name: `E2E F2 WH ${ts}`,
        code: `F2-${ts.toString().slice(-5)}`,
        isPosLocation: true,
      })
      .expect(201);
    warehouseId = wh.body.id;
    const p = await request(app.getHttpServer())
      .post('/api/products')
      .set(h())
      .send({
        name: `E2EF2 producto ${ts}`,
        basePrice: 10000,
        variants: [{ size: 'U', color: 'Único' }],
      })
      .expect(201);
    variantId = p.body.variants[0].id;
    await request(app.getHttpServer())
      .post('/api/inventory/adjust')
      .set(h())
      .send({
        variantId,
        warehouseId,
        quantity: 50,
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
        firstName: 'LILIA',
        lastName: `CARTERA ${ts}`,
        phone: `310${ts.toString().slice(-7)}`,
      })
      .expect(201);
    clientId = c.body.id;
    await fiar(60000);
    await fiar(40000);
  }, 120000);

  afterAll(async () => {
    await teardownTestApp();
  });

  it('la cartera completa trae al cliente con sus dos facturas y cuadra', async () => {
    const r = await request(app.getHttpServer())
      .get('/api/cartera/completa')
      .set(h())
      .expect(200);
    const yo = (
      r.body.clientes as {
        clienteId: string;
        facturas: unknown[];
        saldo: number;
        diasVencidaMax: number;
      }[]
    ).find((c) => c.clienteId === clientId);
    expect(yo).toBeDefined();
    expect(yo!.facturas).toHaveLength(2);
    expect(yo!.saldo).toBe(100000);
    expect(yo!.diasVencidaMax).toBeGreaterThan(0);
    expect(r.body.saldo).toBeGreaterThanOrEqual(100000);
    const pdf = await request(app.getHttpServer())
      .get('/api/cartera/completa?formato=pdf')
      .set(h())
      .expect(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    const xlsx = await request(app.getHttpServer())
      .get('/api/cartera/completa?formato=xlsx')
      .set(h())
      .expect(200);
    expect(xlsx.headers['content-type']).toContain('spreadsheetml');
  }, 60000);

  it('un recibo de 50.000 repartido 30/20 deja un solo lote y la deuda baja', async () => {
    const mal = await request(app.getHttpServer())
      .post(`/api/pos/accounts-receivable/clients/${clientId}/recibo`)
      .set(h())
      .send({
        amount: 50000,
        method: 'EFECTIVO',
        reference: 'RC-77',
        reparto: [{ accountReceivableId: cuentas[0], amount: 30000 }],
      })
      .expect(400);
    expect(mal.body.message).toContain('suma');
    const r = await request(app.getHttpServer())
      .post(`/api/pos/accounts-receivable/clients/${clientId}/recibo`)
      .set(h())
      .send({
        amount: 50000,
        method: 'EFECTIVO',
        reference: 'RC-77',
        reparto: [
          { accountReceivableId: cuentas[0], amount: 30000 },
          { accountReceivableId: cuentas[1], amount: 20000 },
        ],
      })
      .expect(201);
    expect(r.body.allocations).toHaveLength(2);
    expect(
      r.body.allocations.map((a: { amount: number }) => a.amount).sort(),
    ).toEqual([20000, 30000]);
    // Las dos aplicaciones comparten el lote del recibo.
    expect(
      new Set(
        r.body.allocations.map(
          (a: { accountReceivableId: string }) => a.accountReceivableId,
        ),
      ).size,
    ).toBe(2);
    expect(r.body.batchId).toBeTruthy();
    const st = await request(app.getHttpServer())
      .get(`/api/pos/clients/${clientId}/statement`)
      .set(h())
      .expect(200);
    expect(Number(st.body.totals.totalDebt)).toBe(50000);
    // Más de lo que debe una factura, no.
    await request(app.getHttpServer())
      .post(`/api/pos/accounts-receivable/clients/${clientId}/recibo`)
      .set(h())
      .send({
        amount: 40000,
        method: 'EFECTIVO',
        reparto: [{ accountReceivableId: cuentas[0], amount: 40000 }],
      })
      .expect(400);
  }, 60000);

  describe('pedidos del catálogo', () => {
    let tokenP: string;
    let slug: string;
    let locion: string;
    let pedido: { orderId: string };
    const hp = () => ({ Authorization: `Bearer ${tokenP}` });

    const pedir = async (cantidad: number) => {
      const r = await request(app.getHttpServer())
        .post(`/api/storefront/${slug}/orders`)
        .send({
          customerName: 'Local La 14',
          customerPhone: '3009876543',
          shippingAddress: 'CC Unico local 12',
          items: [{ variantId: locion, quantity: cantidad }],
        })
        .expect(201);
      return { orderId: r.body.orderId as string };
    };

    beforeAll(async () => {
      tokenP = (await crearTiendaDePerfumeria(app, ts + 1)).token;
      const wh = await request(app.getHttpServer())
        .post('/api/inventory/warehouses')
        .set(hp())
        .send({
          name: `E2E Pedidos WH ${ts}`,
          code: `PW-${ts.toString().slice(-5)}`,
          isPosLocation: true,
        })
        .expect(201);
      await request(app.getHttpServer())
        .patch('/api/store-settings')
        .set(hp())
        .send({
          catalogoEnabled: true,
          defaultWarehouseId: wh.body.id,
          descuentosPresets: [10, 15, 20, 30],
        })
        .expect(200);
      slug = (
        await request(app.getHttpServer())
          .get('/api/store-settings')
          .set(hp())
          .expect(200)
      ).body.storeSlug;
      const p = await request(app.getHttpServer())
        .post('/api/products')
        .set(hp())
        .send({
          name: `E2EPED Good Girl ${ts}`,
          basePrice: 40000,
          isPublished: true,
          variants: [{ size: 'U', color: 'Único' }],
        })
        .expect(201);
      locion = p.body.variants[0].id;
      await request(app.getHttpServer())
        .post('/api/inventory/adjust')
        .set(hp())
        .send({
          variantId: locion,
          warehouseId: wh.body.id,
          quantity: 20,
          movementType: 'IN',
          notes: 'e2e',
        })
        .expect((r) => {
          if (r.status !== 200 && r.status !== 201) throw new Error(r.text);
        });
      pedido = await pedir(6);
    }, 120000);

    it('aceptar con 15 % y 4 en vez de 6 crea la venta a crédito, descuenta stock y arma el WhatsApp', async () => {
      const items = (
        await request(app.getHttpServer())
          .get(`/api/store-settings/orders/${pedido.orderId}`)
          .set(hp())
          .expect(200)
      ).body.items as { id: string }[];
      await request(app.getHttpServer())
        .post(`/api/store-settings/orders/${pedido.orderId}/aceptar`)
        .set(hp())
        .send({ cantidades: { [items[0].id]: 7 } })
        .expect(400);
      const r = await request(app.getHttpServer())
        .post(`/api/store-settings/orders/${pedido.orderId}/aceptar`)
        .set(hp())
        .send({
          cantidades: { [items[0].id]: 4 },
          descuentoPorcentaje: 15,
          creditDueDate: '2026-12-01',
        })
        .expect(201);
      expect(r.body.total).toBe(4 * 40000 * 0.85);
      expect(r.body.recortes).toEqual([
        {
          nombre: expect.stringContaining('Good Girl'),
          pedida: 6,
          aceptada: 4,
        },
      ]);
      expect(r.body.whatsappUrl).toContain('wa.me/573009876543');
      expect(decodeURIComponent(r.body.whatsappUrl)).toContain(
        'pediste 6, van 4',
      );
      const venta = await request(app.getHttpServer())
        .get(`/api/pos/sales/${r.body.saleId}`)
        .set(hp())
        .expect(200);
      expect(venta.body.items[0].quantity).toBe(4);
      expect(Number(venta.body.items[0].discountPercent)).toBe(15);
      expect(venta.body.client.phone).toBe('3009876543');
      expect(venta.body.accountsReceivable).toHaveLength(1);
      const orden = await request(app.getHttpServer())
        .get(`/api/store-settings/orders/${pedido.orderId}`)
        .set(hp())
        .expect(200);
      expect(orden.body.status).toBe('CONFIRMED');
      expect(orden.body.saleId).toBe(r.body.saleId);
      const stock = await request(app.getHttpServer())
        .get(`/api/inventory/stock/variant/${locion}`)
        .set(hp())
        .expect(200);
      expect(Number(stock.body[0].quantity)).toBe(16);
      // Dos veces, no.
      await request(app.getHttpServer())
        .post(`/api/store-settings/orders/${pedido.orderId}/aceptar`)
        .set(hp())
        .send({})
        .expect(400);
    }, 120000);

    it('rechazar cancela el pedido y arma el WhatsApp con el motivo', async () => {
      const otro = await pedir(2);
      const r = await request(app.getHttpServer())
        .post(`/api/store-settings/orders/${otro.orderId}/rechazar`)
        .set(hp())
        .send({ motivo: 'sin existencias' })
        .expect(201);
      expect(r.body.pedido.status).toBe('CANCELLED');
      expect(decodeURIComponent(r.body.whatsappUrl)).toContain(
        'Motivo: sin existencias',
      );
    }, 60000);
  });
});
