import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { setupTestApp, loginAsAdmin, teardownTestApp } from './helpers/setup';

/**
 * **Cesiones: preguntar o no si ya llegó.** Apagado (AMAWAD), la cesión
 * llega al despacharla y lo devuelto entra al registrarlo. Prendido, el
 * destino confirma la llegada, avisa lo que devuelve (queda en camino, sin
 * mover inventario) y el origen lo recibe.
 */
describe('Cesión con y sin confirmación (e2e)', () => {
  let app: INestApplication;
  let token: string;
  const ts = Date.now();
  const auth = () => ({ Authorization: `Bearer ${token}` });
  let origenId: string;
  let localId: string;
  let variantId: string;

  const nueva = async () => {
    const r = await request(app.getHttpServer())
      .post('/api/street/dispatches')
      .set(auth())
      .send({ destinoTipo: 'BODEGA', destinoWarehouseId: localId, warehouseId: origenId, items: [{ variantId, quantity: 2 }] })
      .expect(201);
    return r.body as { id: string; llegadaConfirmadaAt: string | null; items: { id: string }[] };
  };
  const ajuste = (v: boolean) =>
    request(app.getHttpServer()).patch('/api/store-settings').set(auth()).send({ cesionConfirmacionEnabled: v }).expect(200);

  beforeAll(async () => {
    app = await setupTestApp();
    token = await loginAsAdmin(app);
    const bodega = async (n: string, c: string) => {
      const r = await request(app.getHttpServer())
        .post('/api/inventory/warehouses')
        .set(auth())
        .send({ name: `${n} ${ts}`, code: `${c}${ts.toString().slice(-5)}`, isPosLocation: true })
        .expect(201);
      return r.body.id as string;
    };
    origenId = await bodega('E2E Conf Origen', 'CO-');
    localId = await bodega('E2E Conf Local', 'CD-');
    const prod = await request(app.getHttpServer())
      .post('/api/products')
      .set(auth())
      .send({ name: `E2ECONF ${ts}`, basePrice: 100000, costPrice: 40000, variants: [{ size: '40', color: 'Negro' }] })
      .expect(201);
    variantId = prod.body.variants[0].id;
    await request(app.getHttpServer())
      .post('/api/inventory/adjust')
      .set(auth())
      .send({ variantId, warehouseId: origenId, quantity: 10, movementType: 'IN', notes: 'e2e' })
      .expect(201);
  });

  afterAll(async () => {
    await ajuste(false);
    await teardownTestApp();
  });

  it('apagado: la cesión llega al despacharla, sin preguntar', async () => {
    await ajuste(false);
    const d = await nueva();
    expect(d.llegadaConfirmadaAt).toBeTruthy();
  });

  it('prendido: queda por confirmar llegada; el destino confirma', async () => {
    await ajuste(true);
    const d = await nueva();
    expect(d.llegadaConfirmadaAt).toBeNull();
    const c = await request(app.getHttpServer()).post(`/api/street/dispatches/${d.id}/confirmar-llegada`).set(auth()).expect(201);
    expect(c.body.llegadaConfirmadaAt).toBeTruthy();
  });

  it('prendido: «devolver» deja lo devuelto en camino sin mover inventario; «recibir» lo entra y cierra', async () => {
    await ajuste(true);
    const d = await nueva();
    const stock = async () => {
      const r = await request(app.getHttpServer()).get(`/api/inventory/stock/variant/${variantId}`).set(auth()).expect(200);
      return (r.body as { warehouseId: string; quantity: number }[]).filter((f) => f.warehouseId === origenId).reduce((t, f) => t + Number(f.quantity), 0);
    };
    const antes = await stock();
    const dev = await request(app.getHttpServer())
      .post(`/api/street/dispatches/${d.id}/devolver`)
      .set(auth())
      .send({ items: [{ itemId: d.items[0].id, returning: 2 }] })
      .expect(201);
    expect(dev.body.items[0].quantityReturning).toBe(2);
    expect(dev.body.status).toBe('OPEN');
    expect(await stock()).toBe(antes);
    const rec = await request(app.getHttpServer())
      .post(`/api/street/dispatches/${d.id}/recibir`)
      .set(auth())
      .send({ items: [{ itemId: d.items[0].id, sold: 0, returned: 2 }] })
      .expect(201);
    expect(rec.body.status).toBe('SETTLED');
    expect(rec.body.items[0].quantityReturning).toBe(0);
    expect(await stock()).toBe(antes + 2);
    const mal = await request(app.getHttpServer())
      .post(`/api/street/dispatches/${d.id}/devolver`)
      .set(auth())
      .send({ items: [{ itemId: d.items[0].id, returning: 1 }] })
      .expect(400);
    expect(String(mal.body.message)).toMatch(/cerrada/);
  });
});
