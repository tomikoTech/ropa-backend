import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { setupTestApp, loginAsAdmin, teardownTestApp } from './helpers/setup';

/**
 * **La venta que ya está hecha y sigue creciendo.**
 *
 * El modo rápido del POS: con la forma de pago puesta, el primer producto
 * escaneado **crea la venta**, y lo que se siga escaneando se le anexa. Lo
 * pidieron los dueños así.
 *
 * Eso cambia el orden: el consecutivo y el descuento de inventario ocurren en
 * el primer escaneo, no al final. Y cada anexo **reescribe la venta entera** —
 * `updateSale` revierte todo el inventario y lo vuelve a aplicar—. Esta prueba
 * fija que después de varios anexos el inventario quede exacto, que es
 * justamente lo que esa reescritura puede romper.
 */
describe('Venta que crece (e2e)', () => {
  let app: INestApplication;
  let token: string;
  const ts = Date.now();
  const auth = () => ({ Authorization: `Bearer ${token}` });

  let productId: string;
  let variantA: string;
  let variantB: string;
  let warehouseId: string;
  let ventaId: string;
  let saleNumber: string;

  const PRECIO = 10_000;

  const stockDe = async (variantId: string) => {
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

  /** Reenvía la lista COMPLETA, que es como anexa el POS. */
  const anexar = (lineas: { variantId: string; quantity: number }[]) =>
    request(app.getHttpServer())
      .patch(`/api/pos/sales/${ventaId}`)
      .set(auth())
      .send({
        items: lineas.map((l) => ({ ...l, unitPrice: PRECIO })),
      });

  const detalle = async () => {
    const r = await request(app.getHttpServer())
      .get(`/api/pos/sales/${ventaId}`)
      .set(auth())
      .expect(200);
    return r.body as {
      total: number | string;
      items: { variantId: string; quantity: number }[];
      payments: { method: string; amount: number | string }[];
    };
  };

  beforeAll(async () => {
    app = await setupTestApp();
    token = await loginAsAdmin(app);

    const wh = await request(app.getHttpServer())
      .post('/api/inventory/warehouses')
      .set(auth())
      .send({
        name: `E2E Crece WH ${ts}`,
        code: `CR-${ts.toString().slice(-5)}`,
        isPosLocation: true,
      })
      .expect(201);
    warehouseId = wh.body.id;

    const prod = await request(app.getHttpServer())
      .post('/api/products')
      .set(auth())
      .send({
        name: `E2ECRECE Producto ${ts}`,
        basePrice: PRECIO,
        costPrice: 4000,
        variants: [
          { size: 'U', color: 'Negro' },
          { size: 'U', color: 'Blanco' },
        ],
      })
      .expect(201);
    productId = prod.body.id;
    variantA = prod.body.variants[0].id;
    variantB = prod.body.variants[1].id;

    for (const variantId of [variantA, variantB]) {
      await request(app.getHttpServer())
        .post('/api/inventory/adjust')
        .set(auth())
        .send({
          variantId,
          warehouseId,
          quantity: 100,
          movementType: 'IN',
          notes: 'Carga inicial de la prueba',
        })
        .expect((r) => {
          if (r.status !== 200 && r.status !== 201) {
            throw new Error(`No se pudo cargar stock: ${r.status} ${r.text}`);
          }
        });
    }
  }, 180000);

  afterAll(async () => {
    await teardownTestApp();
  });

  it('el primer producto ya es una venta, con su consecutivo', async () => {
    const antes = await stockDe(variantA);

    const venta = await request(app.getHttpServer())
      .post('/api/pos/sales')
      .set(auth())
      .send({
        warehouseId,
        items: [{ variantId: variantA, quantity: 1, unitPrice: PRECIO }],
        payments: [
          { method: 'EFECTIVO', amount: PRECIO, receivedAmount: PRECIO },
        ],
      })
      .expect(201);

    ventaId = venta.body.id;
    saleNumber = venta.body.saleNumber;
    expect(saleNumber).toBeTruthy();
    // El inventario baja acá, antes de que la venta termine de armarse.
    expect(await stockDe(variantA)).toBe(antes - 1);
  }, 60000);

  it('el segundo producto se anexa a la misma venta', async () => {
    const antesB = await stockDe(variantB);

    await anexar([
      { variantId: variantA, quantity: 1 },
      { variantId: variantB, quantity: 1 },
    ]).expect(200);

    const v = await detalle();
    expect(v.items).toHaveLength(2);
    expect(Number(v.total)).toBe(PRECIO * 2);
    expect(await stockDe(variantB)).toBe(antesB - 1);
  }, 60000);

  it('el consecutivo no cambia: sigue siendo la misma factura', async () => {
    // Anexar no puede generar una factura nueva. Si lo hiciera, cada escaneo
    // quemaría un consecutivo y la numeración quedaría llena de huecos.
    const r = await request(app.getHttpServer())
      .get(`/api/pos/sales/${ventaId}`)
      .set(auth())
      .expect(200);
    expect(r.body.saleNumber).toBe(saleNumber);
  }, 60000);

  it('el pago se reescribe solo: sigue cubriendo el total', async () => {
    // Si el pago se quedara en el total del primer producto, la venta nacería
    // parcialmente pagada y la cartera mostraría una deuda que nadie tiene.
    const v = await detalle();
    const pagado = v.payments.reduce((s, p) => s + Number(p.amount), 0);
    expect(pagado).toBe(Number(v.total));
  }, 60000);

  it('subir la cantidad de un renglón también llega', async () => {
    const antesA = await stockDe(variantA);

    await anexar([
      { variantId: variantA, quantity: 3 },
      { variantId: variantB, quantity: 1 },
    ]).expect(200);

    const v = await detalle();
    expect(Number(v.total)).toBe(PRECIO * 4);
    // Tenía 1, ahora 3: salen 2 más.
    expect(await stockDe(variantA)).toBe(antesA - 2);
  }, 60000);

  it('tras seis anexos seguidos el inventario queda exacto', async () => {
    // Cada anexo revierte TODO y vuelve a descontar TODO. Es el punto donde
    // esto se puede romper, así que se aprieta: seis reescrituras seguidas.
    const antesA = await stockDe(variantA);
    const antesB = await stockDe(variantB);

    for (let n = 1; n <= 6; n++) {
      await anexar([
        { variantId: variantA, quantity: 3 + n },
        { variantId: variantB, quantity: 1 },
      ]).expect(200);
    }

    const v = await detalle();
    expect(Number(v.total)).toBe(PRECIO * (3 + 6 + 1));
    // De 3 pasó a 9: seis unidades menos, ni una más.
    expect(await stockDe(variantA)).toBe(antesA - 6);
    // Y la que no se tocó, intacta.
    expect(await stockDe(variantB)).toBe(antesB);
  }, 120000);

  it('quitar un renglón devuelve su mercancía', async () => {
    const antesB = await stockDe(variantB);

    await anexar([{ variantId: variantA, quantity: 9 }]).expect(200);

    const v = await detalle();
    expect(v.items).toHaveLength(1);
    expect(await stockDe(variantB)).toBe(antesB + 1);
  }, 60000);

  it('una venta sin renglones se rechaza: no se vacía sola', async () => {
    // Borrar el último producto NO puede deshacer una factura que ya existe y
    // ya movió inventario. Eso se anula a mano, y deja rastro.
    await anexar([]).expect(400);
    expect((await detalle()).items).toHaveLength(1);
  }, 60000);
});
