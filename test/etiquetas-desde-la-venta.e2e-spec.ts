import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { setupTestApp, loginAsAdmin, teardownTestApp } from './helpers/setup';

/**
 * **Los códigos que se llevó una factura.**
 *
 * Llega el cliente con la caja sin etiqueta —o rota, o se pegó mal— y hay que
 * volver a sacarla. Sin esto había que ir a Cajas y buscar código por código,
 * teniéndolos todos en la pantalla de la venta.
 *
 * Va por `sale_items` y no por el estado del bulto a propósito: una venta
 * anulada devolvió el par a la bodega y **sigue siendo** el que salió en esa
 * factura.
 */
describe('Etiquetas desde el detalle de una venta (e2e)', () => {
  let app: INestApplication;
  let token: string;
  const ts = Date.now();
  const auth = () => ({ Authorization: `Bearer ${token}` });

  let productId: string;
  let variantId: string;
  let warehouseId: string;
  let cajas: { id: string; barcode: string }[] = [];
  let saleId: string;
  let otraVentaId: string;

  const codigosDe = async (venta: string, extra = '') => {
    const r = await request(app.getHttpServer())
      .get(`/api/stock-units/search?saleId=${venta}&limit=50${extra}`)
      .set(auth())
      .expect(200);
    return r.body.data as {
      id: string;
      barcode: string;
      kind: string;
      product: { name: string };
      pedidoNombre: string | null;
    }[];
  };

  beforeAll(async () => {
    app = await setupTestApp();
    token = await loginAsAdmin(app);

    const wh = await request(app.getHttpServer())
      .post('/api/inventory/warehouses')
      .set(auth())
      .send({
        name: `E2E Etiquetas WH ${ts}`,
        code: `ET-${ts.toString().slice(-5)}`,
        isPosLocation: true,
      })
      .expect(201);
    warehouseId = wh.body.id;

    const prod = await request(app.getHttpServer())
      .post('/api/products')
      .set(auth())
      .send({
        name: `E2EETI Producto ${ts}`,
        basePrice: 100000,
        costPrice: 40000,
        variants: [{ size: 'U', color: 'Negro' }],
      })
      .expect(201);
    productId = prod.body.id;
    variantId = prod.body.variants[0].id;

    const ingreso = await request(app.getHttpServer())
      .post('/api/stock-units/intake')
      .set(auth())
      .send({ productId, boxes: 3, unitsPerBox: 6, warehouseId, unitCost: 40000 })
      .expect(201);
    cajas = ingreso.body;

    const venta = await request(app.getHttpServer())
      .post('/api/pos/sales')
      .set(auth())
      .send({
        warehouseId,
        items: [
          { variantId, quantity: 6, unitPrice: 100000, stockUnitId: cajas[0].id },
          { variantId, quantity: 6, unitPrice: 100000, stockUnitId: cajas[1].id },
        ],
        payments: [{ method: 'EFECTIVO', amount: 1200000 }],
      })
      .expect(201);
    saleId = venta.body.id;

    const otra = await request(app.getHttpServer())
      .post('/api/pos/sales')
      .set(auth())
      .send({
        warehouseId,
        items: [
          { variantId, quantity: 6, unitPrice: 100000, stockUnitId: cajas[2].id },
        ],
        payments: [{ method: 'EFECTIVO', amount: 600000 }],
      })
      .expect(201);
    otraVentaId = otra.body.id;
  }, 120000);

  afterAll(async () => {
    await teardownTestApp();
  });

  it('devuelve las dos cajas de esa factura, y solo esas', async () => {
    const codigos = await codigosDe(saleId);
    expect(codigos).toHaveLength(2);
    expect(codigos.map((c) => c.barcode).sort()).toEqual(
      [cajas[0].barcode, cajas[1].barcode].sort(),
    );
    // La caja de la otra factura no se cuela.
    expect(codigos.map((c) => c.barcode)).not.toContain(cajas[2].barcode);
  });

  it('trae lo que la etiqueta necesita para imprimirse', async () => {
    const [uno] = await codigosDe(saleId);
    expect(uno.kind).toBe('BOX');
    expect(uno.product?.name).toContain('E2EETI');
    // `pedidoNombre` es el rótulo grande de la caja: si no viajara, la etiqueta
    // reimpresa saldría distinta a la original.
    expect(uno).toHaveProperty('pedidoNombre');
  });

  it('una venta sin escanear también sabe qué códigos salieron', () => {
    // Vender sin pasar el lector no deja la factura sin rastro: el ledger le
    // asigna los códigos que sacó de la bodega, y son los que se reimprimen.
    return (async () => {
      await request(app.getHttpServer())
        .post('/api/inventory/adjust')
        .set(auth())
        .send({
          variantId,
          warehouseId,
          quantity: 2,
          movementType: 'IN',
          notes: 'Suelto para la prueba',
        })
        .expect(201);

      const suelta = await request(app.getHttpServer())
        .post('/api/pos/sales')
        .set(auth())
        .send({
          warehouseId,
          items: [{ variantId, quantity: 1, unitPrice: 100000 }],
          payments: [{ method: 'EFECTIVO', amount: 100000 }],
        })
        .expect(201);

      const codigos = await codigosDe(suelta.body.id);
      expect(Array.isArray(codigos)).toBe(true);
      expect(codigos.length).toBeGreaterThanOrEqual(1);
    })();
  });

  it('anular la venta no le quita sus códigos: son los que salieron en ella', async () => {
    await request(app.getHttpServer())
      .post(`/api/pos/sales/${otraVentaId}/cancel`)
      .set(auth())
      .send({})
      .expect(201);

    const codigos = await codigosDe(otraVentaId);
    expect(codigos.map((c) => c.barcode)).toContain(cajas[2].barcode);
  });

  it('se puede pedir una sola caja de la factura', async () => {
    // Es lo que hace el botón de una fila: el mismo filtro más la referencia.
    const codigos = await codigosDe(saleId, `&variantId=${variantId}&kind=BOX`);
    expect(codigos.length).toBeGreaterThanOrEqual(2);
    expect(codigos.every((c) => c.kind === 'BOX')).toBe(true);
  });

  it('rechaza una venta que no es un identificador', async () => {
    const r = await request(app.getHttpServer())
      .get('/api/stock-units/search?saleId=loquesea')
      .set(auth())
      .expect(400);
    expect(String(r.body.message)).toMatch(/venta inválida/i);
  });
});
