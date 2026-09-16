import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { setupTestApp, loginAsAdmin, teardownTestApp } from './helpers/setup';

/**
 * **Subir a la vitrina ese par, por su código.** «Veo la referencia y la
 * vitrina pero no de dónde sale ni qué código es»: con el sticker en la mano
 * se escanea y sube ese, con su código. La vitrina es la que surte el local
 * donde está el bulto.
 */
describe('Exhibir por código (e2e)', () => {
  let app: INestApplication;
  let token: string;
  const ts = Date.now();
  const auth = () => ({ Authorization: `Bearer ${token}` });
  let localId: string;
  let vitrinaId: string;
  let cajas: { id: string; barcode: string; variantId: string; quantity: number }[];

  const dondeEsta = async (barcode: string) => {
    const r = await request(app.getHttpServer()).get(`/api/stock-units/trace/${barcode}`).set(auth()).expect(200);
    return { status: r.body.unit.status as string, warehouseId: r.body.unit.warehouseId as string };
  };

  beforeAll(async () => {
    app = await setupTestApp();
    token = await loginAsAdmin(app);
    await request(app.getHttpServer()).patch('/api/store-settings').set(auth()).send({ exhibicionEnabled: true }).expect(200);
    const local = await request(app.getHttpServer())
      .post('/api/inventory/warehouses')
      .set(auth())
      .send({ name: `E2E Exh Local ${ts}`, code: `EL-${ts.toString().slice(-5)}`, isPosLocation: true })
      .expect(201);
    localId = local.body.id;
    const vitrina = await request(app.getHttpServer())
      .post('/api/inventory/warehouses')
      .set(auth())
      .send({ name: `Vitrina E2E ${ts}`, code: `EV-${ts.toString().slice(-5)}`, isExhibition: true, exhibitionOfWarehouseId: localId, isPosLocation: false })
      .expect(201);
    vitrinaId = vitrina.body.id;
    const prod = await request(app.getHttpServer())
      .post('/api/products')
      .set(auth())
      .send({ name: `E2EEXH Modelo ${ts}`, basePrice: 100000, costPrice: 40000, variants: [{ size: '40', color: 'Negro' }] })
      .expect(201);
    const ingreso = await request(app.getHttpServer())
      .post('/api/stock-units/intake')
      .set(auth())
      .send({ productId: prod.body.id, boxes: 2, unitsPerBox: 6, warehouseId: localId, unitCost: 40000 })
      .expect(201);
    cajas = ingreso.body;
  });

  afterAll(async () => {
    await teardownTestApp();
  });

  it('escaneando la caja sube esa caja, entera, a la vitrina del local', async () => {
    const [, segunda] = cajas;
    const r = await request(app.getHttpServer())
      .post('/api/inventory/exhibicion/exhibir-codigo')
      .set(auth())
      .send({ codigo: segunda.barcode })
      .expect(201);
    expect(r.body).toMatchObject({ movidas: 6, barcode: segunda.barcode, esCaja: true });
    expect(r.body.vitrina).toMatch(/Vitrina E2E/);
    expect(await dondeEsta(segunda.barcode)).toEqual({ status: 'IN_STOCK', warehouseId: vitrinaId });
    expect(await dondeEsta(cajas[0].barcode)).toEqual({ status: 'IN_STOCK', warehouseId: localId });
  });

  it('lo que ya está en la vitrina no se vuelve a subir, y un código ajeno no existe', async () => {
    const [, segunda] = cajas;
    const r = await request(app.getHttpServer())
      .post('/api/inventory/exhibicion/exhibir-codigo')
      .set(auth())
      .send({ codigo: segunda.barcode })
      .expect(400);
    expect(r.body.message).toMatch(/ya está en la vitrina/);
    await request(app.getHttpServer())
      .post('/api/inventory/exhibicion/exhibir-codigo')
      .set(auth())
      .send({ codigo: `no-existe-${ts}` })
      .expect(404);
  });

  it('si el local del bulto no tiene vitrina, lo dice', async () => {
    const otro = await request(app.getHttpServer())
      .post('/api/inventory/warehouses')
      .set(auth())
      .send({ name: `E2E Exh Sin vitrina ${ts}`, code: `ES-${ts.toString().slice(-5)}`, isPosLocation: true })
      .expect(201);
    const [primera] = cajas;
    await request(app.getHttpServer())
      .post('/api/inventory/transfer')
      .set(auth())
      .send({ variantId: primera.variantId, fromWarehouseId: localId, toWarehouseId: otro.body.id, quantity: primera.quantity, stockUnitId: primera.id, requireConfirmation: false })
      .expect(201);
    const r = await request(app.getHttpServer())
      .post('/api/inventory/exhibicion/exhibir-codigo')
      .set(auth())
      .send({ codigo: primera.barcode })
      .expect(400);
    expect(r.body.message).toMatch(/no tiene vitrina/);
  });
});
