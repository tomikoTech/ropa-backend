import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { setupTestApp, loginAsAdmin, teardownTestApp } from './helpers/setup';

/**
 * **Ceder es prestar, y se recibe por partes.** Se prestan dos pares con
 * código y una caja. Un par vuelve el martes (entra al inventario con su
 * código), otro se vendió (venta de verdad), la caja sigue prestada y la
 * cesión sigue abierta. Cuando la caja vuelve, se cierra sola. Y cerrar a
 * mano con algo afuera lo deja como faltante.
 */
describe('Cesión por partes (e2e)', () => {
  let app: INestApplication;
  let token: string;
  const ts = Date.now();
  const auth = () => ({ Authorization: `Bearer ${token}` });
  let warehouseId: string;
  let sellerId: string;
  let pares: { id: string; barcode: string; variantId: string }[];
  let caja: { id: string; barcode: string; variantId: string; quantity: number };
  let dispatchId: string;
  let items: { id: string; stockUnitId: string | null; quantity: number }[];

  const stock = async (variantId: string) => {
    const r = await request(app.getHttpServer()).get(`/api/inventory/stock/variant/${variantId}`).set(auth()).expect(200);
    return (r.body as { warehouseId: string; quantity: number }[])
      .filter((f) => f.warehouseId === warehouseId)
      .reduce((t, f) => t + Number(f.quantity), 0);
  };
  const estado = async (barcode: string) => {
    const r = await request(app.getHttpServer()).get(`/api/stock-units/trace/${barcode}`).set(auth()).expect(200);
    return r.body.unit.status as string;
  };

  beforeAll(async () => {
    app = await setupTestApp();
    token = await loginAsAdmin(app);
    const w = await request(app.getHttpServer())
      .post('/api/inventory/warehouses')
      .set(auth())
      .send({ name: `E2E Cesión Local ${ts}`, code: `CL-${ts.toString().slice(-5)}`, isPosLocation: true })
      .expect(201);
    warehouseId = w.body.id;
    const seller = await request(app.getHttpServer())
      .post('/api/street/sellers')
      .set(auth())
      .send({ name: `Patinador ${ts}`, phone: '3001112233' })
      .expect(201);
    sellerId = seller.body.id;
    const prod = await request(app.getHttpServer())
      .post('/api/products')
      .set(auth())
      .send({ name: `E2ECES Modelo ${ts}`, basePrice: 100000, costPrice: 40000, variants: [{ size: '40', color: 'Negro' }] })
      .expect(201);
    // Dos «pares» con código (bultos de uno) y una caja de seis.
    const sueltos = await request(app.getHttpServer())
      .post('/api/stock-units/intake')
      .set(auth())
      .send({ productId: prod.body.id, boxes: 2, unitsPerBox: 1, warehouseId, unitCost: 40000 })
      .expect(201);
    pares = sueltos.body;
    const cajas = await request(app.getHttpServer())
      .post('/api/stock-units/intake')
      .set(auth())
      .send({ productId: prod.body.id, boxes: 1, unitsPerBox: 6, warehouseId, unitCost: 40000 })
      .expect(201);
    caja = cajas.body[0];
  });

  afterAll(async () => {
    await teardownTestApp();
  });

  it('al ceder, todo sale del inventario como cesión (no como venta)', async () => {
    const antes = await stock(caja.variantId);
    const r = await request(app.getHttpServer())
      .post('/api/street/dispatches')
      .set(auth())
      .send({
        streetSellerId: sellerId,
        warehouseId,
        items: [
          { variantId: pares[0].variantId, quantity: 1, stockUnitId: pares[0].id },
          { variantId: pares[1].variantId, quantity: 1, stockUnitId: pares[1].id },
          { variantId: caja.variantId, quantity: caja.quantity, stockUnitId: caja.id },
        ],
      })
      .expect(201);
    dispatchId = r.body.id;
    items = r.body.items;
    expect(r.body.status).toBe('OPEN');
    expect(await stock(caja.variantId)).toBe(antes - 8);
    expect(await estado(pares[0].barcode)).toBe('CONSIGNED');
    const ventas = await request(app.getHttpServer()).get('/api/pos/sales?limit=5').set(auth()).expect(200);
    const lista = ventas.body.data ?? ventas.body;
    expect(lista.some((v: { notes?: string }) => (v.notes ?? '').includes(r.body.dispatchNumber))).toBe(false);
  });

  it('vuelve un par: entra al inventario con su código y la cesión sigue abierta', async () => {
    const item = items.find((i) => i.stockUnitId === pares[0].id)!;
    const r = await request(app.getHttpServer())
      .post(`/api/street/dispatches/${dispatchId}/recibir`)
      .set(auth())
      .send({ items: [{ itemId: item.id, sold: 0, returned: 1 }] })
      .expect(201);
    expect(r.body.status).toBe('OPEN');
    expect(await estado(pares[0].barcode)).toBe('IN_STOCK');
    expect(await estado(pares[1].barcode)).toBe('CONSIGNED');
    const renglon = r.body.items.find((i: { id: string }) => i.id === item.id);
    expect(renglon.quantityReturned).toBe(1);
  });

  it('se vendió el otro par: venta de verdad, y la caja sigue prestada', async () => {
    const item = items.find((i) => i.stockUnitId === pares[1].id)!;
    const r = await request(app.getHttpServer())
      .post(`/api/street/dispatches/${dispatchId}/recibir`)
      .set(auth())
      .send({ items: [{ itemId: item.id, sold: 1, returned: 0 }] })
      .expect(201);
    expect(r.body.status).toBe('OPEN');
    expect(r.body.saleId).toBeTruthy();
    expect(await estado(pares[1].barcode)).toBe('SOLD');
    expect(await estado(caja.barcode)).toBe('CONSIGNED');
    const venta = await request(app.getHttpServer()).get(`/api/pos/sales/${r.body.saleId}`).set(auth()).expect(200);
    expect(Number(venta.body.total)).toBe(100000);
  });

  it('no se puede recibir más de lo que sigue prestado', async () => {
    const item = items.find((i) => i.stockUnitId === pares[1].id)!;
    const r = await request(app.getHttpServer())
      .post(`/api/street/dispatches/${dispatchId}/recibir`)
      .set(auth())
      .send({ items: [{ itemId: item.id, sold: 0, returned: 1 }] })
      .expect(400);
    expect(String(r.body.message)).toMatch(/en préstamo/);
  });

  it('vuelve la caja entera: se cierra sola, con su código de vuelta', async () => {
    const item = items.find((i) => i.stockUnitId === caja.id)!;
    const antes = await stock(caja.variantId);
    const r = await request(app.getHttpServer())
      .post(`/api/street/dispatches/${dispatchId}/recibir`)
      .set(auth())
      .send({ items: [{ itemId: item.id, sold: 0, returned: caja.quantity }] })
      .expect(201);
    expect(r.body.status).toBe('SETTLED');
    expect(await estado(caja.barcode)).toBe('IN_STOCK');
    expect(await stock(caja.variantId)).toBe(antes + caja.quantity);
  });

  it('cerrar a mano con algo afuera lo deja como faltante', async () => {
    // Otra cesión: la caja vuelve a salir y se cierra sin que vuelva.
    const r = await request(app.getHttpServer())
      .post('/api/street/dispatches')
      .set(auth())
      .send({ streetSellerId: sellerId, warehouseId, items: [{ variantId: caja.variantId, quantity: caja.quantity, stockUnitId: caja.id }] })
      .expect(201);
    const cerrada = await request(app.getHttpServer())
      .post(`/api/street/dispatches/${r.body.id}/settle`)
      .set(auth())
      .send({ items: [{ itemId: r.body.items[0].id, sold: 0, returned: 0 }] })
      .expect(201);
    expect(cerrada.body.status).toBe('SETTLED');
    expect(await estado(caja.barcode)).toBe('WRITTEN_OFF');
  });
});
