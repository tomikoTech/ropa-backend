import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { setupTestApp, loginAsAdmin, teardownTestApp } from './helpers/setup';

/**
 * **Los códigos de una compra, para imprimir sus etiquetas.**
 *
 * Llega la importación y hay que etiquetar lo que trajo. Hasta ahora eso solo
 * se podía hacer entrando a «Cajas e importación» y renglón por renglón: el
 * detalle de la compra —donde se mira qué llegó— no tenía por dónde imprimir,
 * ni todo de una vez ni una caja suelta.
 *
 * Un solo camino con un filtro: la compra entera, o uno de sus renglones.
 */
describe('Etiquetas desde el detalle de una compra (e2e)', () => {
  let app: INestApplication;
  let token: string;
  const ts = Date.now();
  const auth = () => ({ Authorization: `Bearer ${token}` });

  let orderId: string;
  let otraOrdenId: string;
  let lineaA: string;
  let lineaB: string;

  const codigos = async (orden: string, boxLineId?: string) => {
    const r = await request(app.getHttpServer())
      .get(
        `/api/purchases/${orden}/label-units` +
          (boxLineId ? `?boxLineId=${boxLineId}` : ''),
      )
      .set(auth())
      .expect(200);
    return r.body.units as {
      id: string;
      barcode: string;
      kind: string;
      product: { name: string };
      pedidoNombre: string | null;
    }[];
  };

  const renglon = async (
    orden: string,
    productId: string,
    cajas: number,
    unidades: number,
  ) => {
    const r = await request(app.getHttpServer())
      .post(`/api/purchases/${orden}/box-lines`)
      .set(auth())
      .send({ productId, boxes: cajas, unitsPerBox: unidades, unitCost: 1000 })
      .expect(201);
    return r.body.id as string;
  };

  beforeAll(async () => {
    app = await setupTestApp();
    token = await loginAsAdmin(app);

    const wh = await request(app.getHttpServer())
      .post('/api/inventory/warehouses')
      .set(auth())
      .send({
        name: `E2E EtiCompra WH ${ts}`,
        code: `EC-${ts.toString().slice(-5)}`,
      })
      .expect(201);
    const sup = await request(app.getHttpServer())
      .post('/api/suppliers')
      .set(auth())
      .send({ name: `E2E EtiCompra Prov ${ts}`, nit: `902${ts.toString().slice(-6)}-1` })
      .expect(201);
    const prod = await request(app.getHttpServer())
      .post('/api/products')
      .set(auth())
      .send({
        name: `E2EETC Producto ${ts}`,
        basePrice: 90000,
        costPrice: 40000,
        variants: [{ size: 'U', color: 'Negro' }],
      })
      .expect(201);

    const orden = await request(app.getHttpServer())
      .post('/api/purchases')
      .set(auth())
      .send({ supplierId: sup.body.id, warehouseId: wh.body.id, items: [] })
      .expect(201);
    orderId = orden.body.id;
    lineaA = await renglon(orderId, prod.body.id, 2, 6);
    lineaB = await renglon(orderId, prod.body.id, 1, 6);

    const otra = await request(app.getHttpServer())
      .post('/api/purchases')
      .set(auth())
      .send({ supplierId: sup.body.id, warehouseId: wh.body.id, items: [] })
      .expect(201);
    otraOrdenId = otra.body.id;
    await renglon(otraOrdenId, prod.body.id, 1, 6);

    // Recibir crea las cajas con su código: es lo que se etiqueta.
    for (const orden2 of [orderId, otraOrdenId]) {
      await request(app.getHttpServer())
        .post(`/api/stock-units/receive-all/${orden2}`)
        .set(auth())
        .send({})
        .expect(201);
    }
  }, 120000);

  afterAll(async () => {
    await teardownTestApp();
  });

  it('trae las tres cajas de la compra, y ninguna de la otra', async () => {
    const todas = await codigos(orderId);
    expect(todas).toHaveLength(3);
    expect(todas.every((c) => c.kind === 'BOX')).toBe(true);

    const deLaOtra = await codigos(otraOrdenId);
    expect(deLaOtra).toHaveLength(1);
    const idsDeLaOtra = new Set(deLaOtra.map((c) => c.barcode));
    expect(todas.some((c) => idsDeLaOtra.has(c.barcode))).toBe(false);
  });

  it('trae las de un solo renglón: la caja suelta que hay que reimprimir', async () => {
    const dos = await codigos(orderId, lineaA);
    expect(dos).toHaveLength(2);
    const una = await codigos(orderId, lineaB);
    expect(una).toHaveLength(1);
    // Y no se mezclan.
    expect(
      dos.some((c) => una.some((otra) => otra.barcode === c.barcode)),
    ).toBe(false);
  });

  it('un renglón de otra compra no devuelve nada, aunque exista', async () => {
    // El renglón se filtra **dentro** de la orden: pedir el de otra no puede
    // sacar sus etiquetas por una URL armada a mano.
    const otras = await codigos(otraOrdenId, lineaA);
    expect(otras).toHaveLength(0);
  });

  it('trae lo que la etiqueta necesita', async () => {
    const [una] = await codigos(orderId);
    expect(una.product?.name).toContain('E2EETC');
    // El rótulo grande de la caja.
    expect(una).toHaveProperty('pedidoNombre');
  });

  it('rechaza un renglón que no es un identificador', async () => {
    await request(app.getHttpServer())
      .get(`/api/purchases/${orderId}/label-units?boxLineId=loquesea`)
      .set(auth())
      .expect(400);
  });
});
