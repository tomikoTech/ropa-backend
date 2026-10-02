import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { setupTestApp, loginAsAdmin, teardownTestApp } from './helpers/setup';

/**
 * **Dos fichas del mismo cliente se vuelven una, con toda su cartera.**
 *
 * Distri Amber tenía 115 de 126 clientes repetidos por culpa de un import
 * nuestro, y en veinte parejas las dos copias tenían ventas. Lo que se fija
 * acá: después de fusionar, la deuda es la misma pero a nombre de uno solo,
 * la ficha absorbida ya no existe, y crear otra «Lilia Peñalosa» sin
 * documento se frena antes de nacer.
 */
describe('Fusionar clientes (e2e)', () => {
  let app: INestApplication;
  let token: string;
  const ts = Date.now();
  const auth = () => ({ Authorization: `Bearer ${token}` });
  let warehouseId: string;
  let variantId: string;

  const cliente = (body: Record<string, unknown>) =>
    request(app.getHttpServer()).post('/api/clients').set(auth()).send(body);

  const fiar = async (clientId: string, precio: number) => {
    await request(app.getHttpServer())
      .post('/api/pos/sales')
      .set(auth())
      .send({
        clientId,
        warehouseId,
        items: [{ variantId, quantity: 1, unitPrice: precio }],
        payments: [{ method: 'CREDITO', amount: precio }],
        creditDueDate: '2026-12-31',
      })
      .expect(201);
  };

  const deuda = async (clientId: string) => {
    const r = await request(app.getHttpServer())
      .get(`/api/pos/clients/${clientId}/statement`)
      .set(auth())
      .expect(200);
    return Number(r.body.totals.totalDebt);
  };

  beforeAll(async () => {
    app = await setupTestApp();
    token = await loginAsAdmin(app);
    const wh = await request(app.getHttpServer())
      .post('/api/inventory/warehouses')
      .set(auth())
      .send({
        name: `E2E Fusion WH ${ts}`,
        code: `FU-${ts.toString().slice(-5)}`,
        isPosLocation: true,
      })
      .expect(201);
    warehouseId = wh.body.id;
    const p = await request(app.getHttpServer())
      .post('/api/products')
      .set(auth())
      .send({
        name: `E2EFUSION producto ${ts}`,
        basePrice: 10000,
        variants: [{ size: 'U', color: 'Único' }],
      })
      .expect(201);
    variantId = p.body.variants[0].id;
    await request(app.getHttpServer())
      .post('/api/inventory/adjust')
      .set(auth())
      .send({
        variantId,
        warehouseId,
        quantity: 50,
        movementType: 'IN',
        notes: 'e2e',
      })
      .expect((res) => {
        if (res.status !== 200 && res.status !== 201) throw new Error(res.text);
      });
  }, 120000);

  afterAll(async () => {
    await teardownTestApp();
  });

  it('la misma persona sin documento no se crea dos veces', async () => {
    await cliente({ firstName: 'LILIA', lastName: `PEÑALOSA ${ts}` }).expect(
      201,
    );
    const otra = await cliente({
      firstName: `Lilia Peñalosa ${ts}`,
      lastName: '',
    }).expect(409);
    expect(otra.body.message).toContain('Ya existe un cliente llamado');
    // Con documento sí: ya hay cómo distinguirlas.
    await cliente({
      firstName: `Lilia Peñalosa ${ts}`,
      lastName: '',
      documentNumber: `${ts}1`,
    }).expect(201);
  });

  it('fusionar mueve las ventas y la deuda, y la ficha absorbida desaparece', async () => {
    const vieja = await cliente({
      firstName: 'FABIO',
      lastName: `RIOS ${ts}`,
      phone: `300${ts.toString().slice(-7)}`,
    }).expect(201);
    const nueva = await cliente({
      firstName: `Fabio Rios ${ts}`,
      lastName: '',
      phone: `301${ts.toString().slice(-7)}`,
      address: 'CC Unico local 4',
    }).expect(201);
    await fiar(vieja.body.id, 10000);
    await fiar(nueva.body.id, 25000);
    await fiar(nueva.body.id, 5000);
    expect(await deuda(vieja.body.id)).toBe(10000);
    expect(await deuda(nueva.body.id)).toBe(30000);

    const r = await request(app.getHttpServer())
      .post(`/api/clients/${vieja.body.id}/fusionar/${nueva.body.id}`)
      .set(auth())
      .expect(201);
    expect(r.body.movidos.sales).toBe(2);
    expect(r.body.movidos.accounts_receivable).toBe(2);
    // La dirección que la vieja no tenía se la queda.
    expect(r.body.sobrevive.address).toBe('CC Unico local 4');
    // El teléfono que ya tenía no se pisa.
    expect(r.body.sobrevive.phone).toBe(`300${ts.toString().slice(-7)}`);

    expect(await deuda(vieja.body.id)).toBe(40000);
    await request(app.getHttpServer())
      .get(`/api/clients/${nueva.body.id}`)
      .set(auth())
      .expect(404);
  }, 120000);

  it('no se fusiona consigo mismo', async () => {
    const c = await cliente({
      firstName: 'SOLO',
      lastName: `UNO ${ts}`,
    }).expect(201);
    await request(app.getHttpServer())
      .post(`/api/clients/${c.body.id}/fusionar/${c.body.id}`)
      .set(auth())
      .expect(400);
  });
});
