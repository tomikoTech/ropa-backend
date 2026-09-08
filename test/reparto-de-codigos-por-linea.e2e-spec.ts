import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { setupTestApp, loginAsAdmin, teardownTestApp } from './helpers/setup';

/**
 * **Cada renglón de la factura se queda con SUS cajas.**
 *
 * El detalle de una venta reparte entre sus líneas los códigos que la venta
 * sacó. El reparto contaba códigos, no unidades: a una línea de 24 pares le
 * entregaba hasta 24 **códigos**, y como cada código era una caja de 24, la
 * primera línea se llevaba las cuatro cajas de la venta y las otras tres
 * quedaban sin ninguna.
 *
 * Eso rompía la edición: al guardar, el servidor intentaba descontar cuatro
 * cajas para una línea de 24, los bultos se agotaban en el primer renglón y el
 * resto moría con «el código … ya no está disponible». Daba igual qué etiqueta
 * se escaneara —la factura llegaba mal repartida desde antes—, y por eso el
 * cliente reportó que fallaba con todos los stickers.
 */
describe('Cada línea se queda con sus cajas (e2e)', () => {
  let app: INestApplication;
  let token: string;
  const ts = Date.now();
  const auth = () => ({ Authorization: `Bearer ${token}` });

  let productId: string;
  let variantId: string;
  let warehouseId: string;
  let cajas: { id: string; barcode: string }[] = [];
  let saleId: string;

  beforeAll(async () => {
    app = await setupTestApp();
    token = await loginAsAdmin(app);

    const wh = await request(app.getHttpServer())
      .post('/api/inventory/warehouses')
      .set(auth())
      .send({
        name: `E2E Reparto WH ${ts}`,
        code: `RE-${ts.toString().slice(-5)}`,
        isPosLocation: true,
      })
      .expect(201);
    warehouseId = wh.body.id;

    const prod = await request(app.getHttpServer())
      .post('/api/products')
      .set(auth())
      .send({
        name: `E2EREP Producto ${ts}`,
        basePrice: 100000,
        costPrice: 40000,
        variants: [{ size: 'U', color: 'Negro' }],
      })
      .expect(201);
    productId = prod.body.id;
    variantId = prod.body.variants[0].id;

    // Cuatro cajas de 24: la forma de la venta que lo destapó.
    await request(app.getHttpServer())
      .post('/api/stock-units/intake')
      .set(auth())
      .send({ productId, boxes: 4, unitsPerBox: 24, warehouseId, unitCost: 40000 })
      .expect(201);

    const encontrados = await request(app.getHttpServer())
      .get(`/api/stock-units/search?productId=${productId}&status=IN_STOCK&limit=10`)
      .set(auth())
      .expect(200);
    cajas = (encontrados.body.data as { id: string; barcode: string }[]).slice(0, 4);
    expect(cajas).toHaveLength(4);
  }, 120000);

  afterAll(async () => {
    await teardownTestApp();
  });

  it('una venta con tres cajas iguales, en tres renglones', async () => {
    const venta = await request(app.getHttpServer())
      .post('/api/pos/sales')
      .set(auth())
      .send({
        warehouseId,
        items: cajas.slice(0, 3).map((c) => ({
          variantId,
          quantity: 24,
          unitPrice: 100000,
          stockUnitId: c.id,
        })),
        payments: [{ method: 'EFECTIVO', amount: 7200000 }],
      })
      .expect(201);
    saleId = venta.body.id;
    expect(venta.body.items).toHaveLength(3);
  }, 60000);

  it('cada renglón trae UNA caja, no las tres', async () => {
    const r = await request(app.getHttpServer())
      .get(`/api/pos/sales/${saleId}`)
      .set(auth())
      .expect(200);

    const lineas = r.body.items as { stockUnitIds?: string[] }[];
    expect(lineas).toHaveLength(3);
    for (const linea of lineas) {
      // Esto era lo que fallaba: la primera se llevaba las tres.
      expect(linea.stockUnitIds ?? []).toHaveLength(1);
    }

    // Y entre las tres están las tres cajas, sin repetir ninguna.
    const todos = lineas.flatMap((l) => l.stockUnitIds ?? []);
    expect(new Set(todos).size).toBe(3);
  }, 60000);

  it('y por eso se le puede anexar un producto sin que reviente', async () => {
    const actual = await request(app.getHttpServer())
      .get(`/api/pos/sales/${saleId}`)
      .set(auth())
      .expect(200);

    const items = (
      actual.body.items as {
        variantId: string;
        quantity: number;
        unitPrice: string;
        stockUnitIds?: string[];
      }[]
    ).map((i) => ({
      variantId: i.variantId,
      quantity: i.quantity,
      unitPrice: Number(i.unitPrice),
      stockUnitIds: i.stockUnitIds?.length ? i.stockUnitIds : undefined,
    }));

    // La cuarta caja, escaneada: exactamente lo que hace «Añadir producto».
    await request(app.getHttpServer())
      .patch(`/api/pos/sales/${saleId}`)
      .set(auth())
      .send({
        items: [
          ...items,
          {
            variantId,
            quantity: 24,
            unitPrice: 100000,
            stockUnitIds: [cajas[3].id],
          },
        ],
      })
      .expect(200);

    const despues = await request(app.getHttpServer())
      .get(`/api/pos/sales/${saleId}`)
      .set(auth())
      .expect(200);
    expect(despues.body.items).toHaveLength(4);
  }, 60000);
});
