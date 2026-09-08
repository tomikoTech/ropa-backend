import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { setupTestApp, loginAsAdmin, teardownTestApp } from './helpers/setup';

/**
 * Editar una venta con **varias cajas de la misma referencia** no puede
 * perderles el código.
 *
 * El emparejamiento con las líneas anteriores era un `Map` por variante: cuatro
 * cajas de la misma referencia entraban al mapa como una sola —la última—, así
 * que tres se quedaban sin `previous` y perdían su `stockUnitId`. Esas cajas
 * dejaban de marcarse como vendidas, el inventario se descontaba por cascada en
 * vez de salir de su bodega, y el detalle las mostraba «sin código».
 */
describe('Editar una venta con varias cajas iguales (e2e)', () => {
  let app: INestApplication;
  let token: string;
  const ts = Date.now();
  const auth = () => ({ Authorization: `Bearer ${token}` });

  let warehouseId: string;
  let variantId: string;
  let otraVarianteId: string;
  let bultos: { id: string; barcode: string }[] = [];
  /** Una caja más, que NO entra en la venta: sirve para agregarla después. */
  let cajaSuelta: { id: string } | undefined;
  let saleId: string;

  beforeAll(async () => {
    app = await setupTestApp();
    token = await loginAsAdmin(app);

    const wh = await request(app.getHttpServer())
      .post('/api/inventory/warehouses')
      .set(auth())
      .send({
        name: `E2E Cajas WH ${ts}`,
        code: `EC-${ts.toString().slice(-5)}`,
        isPosLocation: true,
      })
      .expect(201);
    warehouseId = wh.body.id;

    const prod = await request(app.getHttpServer())
      .post('/api/products')
      .set(auth())
      .send({
        name: `E2E Cajas Producto ${ts}`,
        basePrice: 100000,
        costPrice: 40000,
        variants: [{ size: 'U', color: 'Negro' }],
      })
      .expect(201);
    variantId = prod.body.variants[0].id;

    const otro = await request(app.getHttpServer())
      .post('/api/products')
      .set(auth())
      .send({
        name: `E2E Cajas Otro ${ts}`,
        basePrice: 50000,
        costPrice: 20000,
        variants: [{ size: 'U', color: 'Rojo' }],
      })
      .expect(201);
    otraVarianteId = otro.body.variants[0].id;
    await request(app.getHttpServer())
      .post('/api/inventory/adjust')
      .set(auth())
      .send({
        variantId: otraVarianteId,
        warehouseId,
        quantity: 5,
        movementType: 'IN',
        notes: 'stock para la prueba',
      })
      .expect(201);

    // Tres cajas iguales, de la misma referencia.
    await request(app.getHttpServer())
      .post('/api/stock-units/intake')
      .set(auth())
      .send({
        productId: prod.body.id,
        // Cuatro: tres van a la venta y una queda para agregarla después.
        boxes: 4,
        unitsPerBox: 24,
        warehouseId,
        unitCost: 40000,
      })
      .expect(201);

    const encontrados = await request(app.getHttpServer())
      .get(`/api/stock-units/search?productId=${prod.body.id}&status=IN_STOCK&limit=50`)
      .set(auth())
      .expect(200);
    const todas = encontrados.body.data as { id: string; barcode: string }[];
    expect(todas.length).toBeGreaterThanOrEqual(4);
    bultos = todas.slice(0, 3);
    cajaSuelta = todas[3];

    // Una venta con las tres cajas: tres líneas de la MISMA variante.
    const venta = await request(app.getHttpServer())
      .post('/api/pos/sales')
      .set(auth())
      .send({
        warehouseId,
        // `stockUnitId` en singular: es lo que acepta crear una venta. En
        // plural lo descarta el ValidationPipe y la caja no queda vendida.
        items: bultos.map((b) => ({
          variantId,
          quantity: 24,
          unitPrice: 100000,
          stockUnitId: b.id,
        })),
        payments: [{ method: 'EFECTIVO', amount: 7200000 }],
      })
      .expect(201);
    saleId = venta.body.id;
  }, 120000);

  afterAll(async () => {
    await teardownTestApp();
  });

  it('la venta nace con las tres cajas y cada una con su código', async () => {
    const r = await request(app.getHttpServer())
      .get(`/api/pos/sales/${saleId}`)
      .set(auth())
      .expect(200);
    const items = r.body.items as { quantity: number; stockUnitId: string | null }[];
    expect(items).toHaveLength(3);
    expect(items.every((i) => !!i.stockUnitId)).toBe(true);
    expect(items.reduce((s, i) => s + Number(i.quantity), 0)).toBe(72);
  });

  it('agregar UNA CAJA a la venta descuenta 24, no 1 más 23 por cascada', async () => {
    // El descuadre real: la caja se contaba como **un** bulto, así que la
    // línea de 24 quedaba «faltando 23», y esas 23 salían ADEMÁS por la
    // cascada. Cada edición se comía 24 unidades del inventario.
    const antes = await request(app.getHttpServer())
      .get(`/api/inventory/stock?variantId=${variantId}&warehouseId=${warehouseId}`)
      .set(auth())
      .expect(200);
    const saldoAntes = Number(
      (Array.isArray(antes.body) ? antes.body : antes.body.data)?.[0]?.quantity ?? 0,
    );

    // La cuarta caja, que no estaba en la venta: entra sin `previous`, que es
    // el camino donde vivía el fallo.
    const nueva = cajaSuelta!;

    await request(app.getHttpServer())
      .patch(`/api/pos/sales/${saleId}`)
      .set(auth())
      .send({
        items: [
          ...bultos.map((b) => ({
            variantId,
            quantity: 24,
            unitPrice: 100000,
            stockUnitIds: [b.id],
          })),
          { variantId: otraVarianteId, quantity: 1, unitPrice: 50000 },
          {
            variantId,
            quantity: 24,
            unitPrice: 100000,
            stockUnitIds: [nueva.id],
          },
        ],
      })
      .expect(200);

    const movimientos = await request(app.getHttpServer())
      .get(`/api/inventory/movements?limit=100`)
      .set(auth())
      .expect(200);
    const filas = (
      Array.isArray(movimientos.body) ? movimientos.body : movimientos.body.data
    ) as { notes?: string | null; quantity: number; referenceId?: string }[];
    const deEstaVenta = filas.filter((m) => m.referenceId === saleId);
    // Ni una sola línea de «faltaron N etiquetas» por esta edición.
    expect(
      deEstaVenta.filter((m) => /Faltaron \d+ etiqueta/i.test(m.notes ?? '')),
    ).toHaveLength(0);
    expect(saldoAntes).toBeGreaterThanOrEqual(0);
  }, 60000);

  it('al agregar otro producto, las tres cajas CONSERVAN su código', async () => {
    // Esto obliga a recrear las líneas, que es donde se perdían.
    await request(app.getHttpServer())
      .patch(`/api/pos/sales/${saleId}`)
      .set(auth())
      .send({
        items: [
          ...bultos.map((b) => ({
            variantId,
            quantity: 24,
            unitPrice: 100000,
            stockUnitIds: [b.id],
          })),
          { variantId: otraVarianteId, quantity: 1, unitPrice: 50000 },
        ],
      })
      .expect((res) => {
        if (res.status !== 200) {
          throw new Error(
            `PATCH devolvió ${res.status}: ${JSON.stringify(res.body)}`,
          );
        }
      });

    const r = await request(app.getHttpServer())
      .get(`/api/pos/sales/${saleId}`)
      .set(auth())
      .expect(200);
    const items = r.body.items as {
      variantId: string;
      quantity: number;
      stockUnitId: string | null;
    }[];
    expect(items).toHaveLength(4);

    const cajas = items.filter((i) => i.variantId === variantId);
    expect(cajas).toHaveLength(3);
    // Antes: dos de las tres quedaban con `stockUnitId` en null.
    expect(cajas.filter((c) => !c.stockUnitId)).toHaveLength(0);
    // Y cada una con la SUYA, sin repetirse.
    expect(new Set(cajas.map((c) => c.stockUnitId)).size).toBe(3);
    // La cantidad no se pierde por el camino.
    expect(cajas.reduce((s, c) => s + Number(c.quantity), 0)).toBe(72);
  }, 60000);
});
