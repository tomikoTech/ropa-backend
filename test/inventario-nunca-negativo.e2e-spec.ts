import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { setupTestApp, loginAsAdmin, teardownTestApp } from './helpers/setup';

/**
 * **El inventario nunca puede quedar en un número imposible.**
 *
 * Antes, vender un par que la bodega no reconocía dejaba el saldo en −1 «como
 * aviso». Pero ese aviso vive en una columna que nadie mira: envenena la
 * valorización, el balance y el «cuánto queda del pedido», y el descuadre crece
 * sin que nadie lo note. Somos un sistema de inventario; un menos uno no es un
 * aviso, es una mentira.
 *
 * Lo que de verdad pasó es que salió mercancía que no estaba registrada: un
 * **faltante**. Se reconoce con su propio ajuste —la venta queda por su valor
 * real— y el saldo se queda en cero.
 */
describe('El inventario nunca queda negativo (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let dataSource: DataSource;
  const ts = Date.now();
  const auth = () => ({ Authorization: `Bearer ${token}` });

  let variantId: string;
  let warehouseId: string;
  let bulto: { id: string; barcode: string };
  /** Otra bodega con existencias: la que hace pasar la validación global. */
  let otraBodegaId: string;

  beforeAll(async () => {
    app = await setupTestApp();
    token = await loginAsAdmin(app);
    dataSource = app.get(DataSource);

    const wh = await request(app.getHttpServer())
      .post('/api/inventory/warehouses')
      .set(auth())
      .send({
        name: `E2E Negativo WH ${ts}`,
        code: `NG-${ts.toString().slice(-5)}`,
        isPosLocation: true,
      })
      .expect(201);
    warehouseId = wh.body.id;

    const prod = await request(app.getHttpServer())
      .post('/api/products')
      .set(auth())
      .send({
        name: `E2E Negativo Producto ${ts}`,
        basePrice: 100000,
        costPrice: 40000,
        variants: [{ size: 'U', color: 'Negro' }],
      })
      .expect(201);
    variantId = prod.body.variants[0].id;

    const wh2 = await request(app.getHttpServer())
      .post('/api/inventory/warehouses')
      .set(auth())
      .send({
        name: `E2E Negativo WH2 ${ts}`,
        code: `NG2-${ts.toString().slice(-4)}`,
        isPosLocation: true,
      })
      .expect(201);
    otraBodegaId = wh2.body.id;

    // Un par etiquetado de verdad: es el que el cajero va a escanear.
    await request(app.getHttpServer())
      .post('/api/stock-units/intake')
      .set(auth())
      .send({
        productId: prod.body.id,
        boxes: 1,
        unitsPerBox: 1,
        warehouseId,
        unitCost: 40000,
      })
      .expect(201);
    const encontrados = await request(app.getHttpServer())
      .get(`/api/stock-units/search?productId=${prod.body.id}&status=IN_STOCK&limit=10`)
      .set(auth())
      .expect(200);
    bulto = (encontrados.body.data as { id: string; barcode: string }[])[0];
    expect(bulto).toBeDefined();
  }, 90000);

  afterAll(async () => {
    await teardownTestApp();
  });

  const saldo = async () => {
    const filas: { quantity: string }[] = await dataSource.query(
      `SELECT quantity FROM stock WHERE variant_id = $1 AND warehouse_id = $2`,
      [variantId, warehouseId],
    );
    return Number(filas[0]?.quantity ?? 0);
  };

  it('vender un par que el agregado no reconoce deja CERO, no negativo', async () => {
    // El caso real de la tienda: la validación mira el total de TODAS las
    // bodegas —«hay 1, pides 1, adelante»— pero el descuento va entero a la
    // bodega del bulto, que no lo tenía. Ahí nacía el menos uno.
    await dataSource.query(
      `UPDATE stock SET quantity = 0 WHERE variant_id = $1 AND warehouse_id = $2`,
      [variantId, warehouseId],
    );
    await request(app.getHttpServer())
      .post('/api/inventory/adjust')
      .set(auth())
      .send({
        variantId,
        warehouseId: otraBodegaId,
        quantity: 1,
        movementType: 'IN',
        notes: 'existencia en la otra bodega',
      })
      .expect(201);
    expect(await saldo()).toBe(0);

    await request(app.getHttpServer())
      .post('/api/pos/sales')
      .set(auth())
      .send({
        warehouseId,
        items: [
          {
            variantId,
            quantity: 1,
            unitPrice: 100000,
            stockUnitId: bulto.id,
          },
        ],
        payments: [{ method: 'EFECTIVO', amount: 100000 }],
      })
      .expect((res) => {
        if (res.status !== 201) {
          throw new Error(`venta ${res.status}: ${JSON.stringify(res.body)}`);
        }
      });

    // Antes: −1. Un saldo que no existe.
    expect(await saldo()).toBe(0);
  }, 60000);

  it('el faltante queda reconocido, con su nombre y su cuenta', async () => {
    const filas: {
      quantity: string;
      notes: string;
      movement_type: string;
      reference_type: string;
    }[] = await dataSource.query(
      `SELECT quantity, notes, movement_type, reference_type
         FROM stock_movements
        WHERE variant_id = $1 AND warehouse_id = $2
          AND notes ILIKE '%Faltante reconocido%'`,
      [variantId, warehouseId],
    );
    expect(filas).toHaveLength(1);
    // Faltaba uno: el ajuste lo repone en el agregado y deja el rastro. Entra
    // al agregado (por eso «IN»), y el motivo dice que es un ajuste.
    expect(Number(filas[0].quantity)).toBe(1);
    expect(filas[0].movement_type).toBe('IN');
    expect(filas[0].reference_type).toBe('ADJUSTMENT');
    expect(filas[0].notes).toMatch(/tenía 0 y salieron 1/);
  });

  it('la venta se registró por lo que de verdad salió, no por lo que había', async () => {
    // El faltante no se come la venta: el cliente pagó dos y la factura dice
    // dos. Tocar eso sería cuadrar el inventario mintiendo en la caja.
    const filas: { quantity: string }[] = await dataSource.query(
      `SELECT quantity FROM stock_movements
        WHERE variant_id = $1 AND warehouse_id = $2 AND reference_type = 'SALE'`,
      [variantId, warehouseId],
    );
    expect(filas.map((f) => Number(f.quantity))).toContain(-1);
  });
});
