import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { setupTestApp, loginAsAdmin, teardownTestApp } from './helpers/setup';

/**
 * **La vitrina es una plantilla.** Se exhibe una caja, se vende, y la
 * referencia no sale del aparador: queda un hueco. Si el local tiene más, se
 * repone; si no, se pide a la bodega que sí tenga. Y bajar de la vitrina
 * devuelve el bulto al local sin borrar el puesto.
 */
describe('Huecos de la vitrina (e2e)', () => {
  let app: INestApplication;
  let token: string;
  const ts = Date.now();
  const auth = () => ({ Authorization: `Bearer ${token}` });
  let localId: string;
  let bodegaId: string;
  let vitrinaId: string;
  let productId: string;
  let cajas: { id: string; barcode: string; variantId: string; quantity: number }[];

  const bodega = async (nombre: string, code: string, extra: object = {}) => {
    const r = await request(app.getHttpServer())
      .post('/api/inventory/warehouses')
      .set(auth())
      .send({ name: `${nombre} ${ts}`, code: `${code}${ts.toString().slice(-5)}`, isPosLocation: true, ...extra })
      .expect(201);
    return r.body.id as string;
  };

  beforeAll(async () => {
    app = await setupTestApp();
    token = await loginAsAdmin(app);
    await request(app.getHttpServer()).patch('/api/store-settings').set(auth()).send({ exhibicionEnabled: true }).expect(200);
    localId = await bodega('E2E Hueco Local', 'HL-');
    bodegaId = await bodega('E2E Hueco Bodega', 'HB-');
    vitrinaId = await bodega('Vitrina Hueco', 'HV-', { isExhibition: true, exhibitionOfWarehouseId: localId, isPosLocation: false });
    const prod = await request(app.getHttpServer())
      .post('/api/products')
      .set(auth())
      .send({ name: `E2EHUECO Modelo ${ts}`, basePrice: 100000, costPrice: 40000, variants: [{ size: '40', color: 'Negro' }] })
      .expect(201);
    productId = prod.body.id;
    const ingreso = await request(app.getHttpServer())
      .post('/api/stock-units/intake')
      .set(auth())
      .send({ productId, boxes: 2, unitsPerBox: 1, warehouseId: localId, unitCost: 40000 })
      .expect(201);
    cajas = ingreso.body;
  });

  afterAll(async () => {
    await teardownTestApp();
  });

  it('exhibir le da el puesto a la referencia; mientras está, no es hueco', async () => {
    await request(app.getHttpServer())
      .post('/api/inventory/exhibicion/exhibir-codigo')
      .set(auth())
      .send({ codigo: cajas[0].barcode })
      .expect(201);
    const plantilla = await request(app.getHttpServer()).get(`/api/inventory/exhibicion/plantilla?vitrinaId=${vitrinaId}`).set(auth()).expect(200);
    const puesto = plantilla.body.find((f: { productId: string }) => f.productId === productId);
    expect(puesto).toMatchObject({ enVitrina: 1, enLocal: 1, hueco: false });
    // El código de lo que está en la vitrina: es lo que identifica cuál es.
    expect(puesto.bultosEnVitrina).toEqual([
      { codigo: cajas[0].barcode, talla: '40', esCaja: true, pares: 1 },
    ]);
    const huecos = await request(app.getHttpServer()).get('/api/inventory/exhibicion/huecos').set(auth()).expect(200);
    expect(huecos.body.some((h: { productId: string }) => h.productId === productId)).toBe(false);
  });

  it('se vende la muestra: queda el hueco, y como el local tiene otra, se repone', async () => {
    await request(app.getHttpServer())
      .post('/api/pos/sales')
      .set(auth())
      .send({
        warehouseId: vitrinaId,
        items: [{ variantId: cajas[0].variantId, quantity: 1, unitPrice: 100000, stockUnitId: cajas[0].id }],
        payments: [{ method: 'EFECTIVO', amount: 100000 }],
      })
      .expect(201);
    const huecos = await request(app.getHttpServer()).get('/api/inventory/exhibicion/huecos').set(auth()).expect(200);
    const h = huecos.body.find((x: { productId: string }) => x.productId === productId);
    expect(h).toMatchObject({ accion: 'reponer', enVitrina: 0, enLocal: 1, vendidasDeLaVitrina: 1 });
    expect(h.ultimaMuestra.codigo).toBe(cajas[0].barcode);
    expect(h.ultimaMuestra.talla).toBe('40');
  });

  it('si el local se queda sin, se solicita a la bodega que tenga', async () => {
    // La que quedaba en el local se va a la otra bodega.
    await request(app.getHttpServer())
      .post('/api/inventory/transfer')
      .set(auth())
      .send({ variantId: cajas[1].variantId, fromWarehouseId: localId, toWarehouseId: bodegaId, quantity: 1, stockUnitId: cajas[1].id, requireConfirmation: false })
      .expect(201);
    const huecos = await request(app.getHttpServer()).get('/api/inventory/exhibicion/huecos').set(auth()).expect(200);
    const h = huecos.body.find((x: { productId: string }) => x.productId === productId);
    expect(h.accion).toBe('solicitar');
    expect(h.pedirA.bodega).toMatch(/E2E Hueco Bodega/);
    expect(h.pedirA.cantidad).toBe(1);
  });

  it('bajar de la vitrina devuelve el bulto al local y no borra el puesto; quitar de la plantilla sí', async () => {
    // Vuelve la caja al local y sube de nuevo, para poder bajarla.
    await request(app.getHttpServer())
      .post('/api/inventory/transfer')
      .set(auth())
      .send({ variantId: cajas[1].variantId, fromWarehouseId: bodegaId, toWarehouseId: localId, quantity: 1, stockUnitId: cajas[1].id, requireConfirmation: false })
      .expect(201);
    await request(app.getHttpServer()).post('/api/inventory/exhibicion/exhibir-codigo').set(auth()).send({ codigo: cajas[1].barcode }).expect(201);
    const bajada = await request(app.getHttpServer()).post('/api/inventory/exhibicion/bajar-codigo').set(auth()).send({ codigo: cajas[1].barcode }).expect(201);
    expect(bajada.body.local).toMatch(/E2E Hueco Local/);
    const t = await request(app.getHttpServer()).get(`/api/stock-units/trace/${cajas[1].barcode}`).set(auth()).expect(200);
    expect(t.body.unit.warehouseId).toBe(localId);
    // Sigue con puesto (y ahora vacío): es un hueco que se repone.
    let huecos = await request(app.getHttpServer()).get('/api/inventory/exhibicion/huecos').set(auth()).expect(200);
    expect(huecos.body.find((x: { productId: string }) => x.productId === productId)?.accion).toBe('reponer');
    await request(app.getHttpServer()).delete(`/api/inventory/exhibicion/plantilla/${vitrinaId}/${productId}`).set(auth()).expect(200);
    huecos = await request(app.getHttpServer()).get('/api/inventory/exhibicion/huecos').set(auth()).expect(200);
    expect(huecos.body.some((x: { productId: string }) => x.productId === productId)).toBe(false);
  });
});
