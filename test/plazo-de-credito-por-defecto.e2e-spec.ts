import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { setupTestApp, loginAsAdmin, teardownTestApp } from './helpers/setup';

/**
 * **El plazo con el que nace una venta a crédito.**
 *
 * Quien vende siempre a noventa días estaba escribiendo la misma fecha en cada
 * factura. El ajuste vive en la tienda y el POS solo lo usa para llenar el
 * campo: la fecha se sigue pudiendo cambiar en cada venta, y el servidor sigue
 * exigiéndola —el ajuste no la inventa por nadie—.
 *
 * Esta prueba cubre el viaje del dato: que se pueda guardar, que vuelva en la
 * lectura y que apagarlo lo deje como estaba.
 */
describe('Plazo de crédito por defecto (e2e)', () => {
  let app: INestApplication;
  let token: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });

  const guardar = (creditDefaultDays: number | null) =>
    request(app.getHttpServer())
      .patch('/api/store-settings')
      .set(auth())
      .send({ creditDefaultDays });

  const leer = () =>
    request(app.getHttpServer())
      .get('/api/store-settings')
      .set(auth())
      .expect(200);

  let original: number | null = null;

  beforeAll(async () => {
    app = await setupTestApp();
    token = await loginAsAdmin(app);
    original = (await leer()).body.creditDefaultDays ?? null;
  }, 180000);

  afterAll(async () => {
    // Se deja como estaba: esta base la comparten las demás pruebas.
    await guardar(original);
    await teardownTestApp();
  });

  it('nace sin plazo: el campo de fecha sigue naciendo vacío', async () => {
    await guardar(0).expect(200);
    const r = await leer();
    // Cero y nulo son la misma cosa —«sin plazo»— y se guarda una sola.
    expect(r.body.creditDefaultDays ?? null).toBeNull();
  }, 60000);

  it('guarda los 90 días y los devuelve', async () => {
    await guardar(90).expect(200);
    expect((await leer()).body.creditDefaultDays).toBe(90);
  }, 60000);

  it('acepta un plazo que no es de los tres botones', async () => {
    await guardar(45).expect(200);
    expect((await leer()).body.creditDefaultDays).toBe(45);
  }, 60000);

  it('no acepta un plazo imposible', async () => {
    // Un año y medio de plazo es un dedo que se resbaló, no una venta.
    await guardar(4000).expect(400);
    await guardar(-30).expect(400);
    // Y lo anterior sigue en pie: un rechazo no puede dejar el ajuste a medias.
    expect((await leer()).body.creditDefaultDays).toBe(45);
  }, 60000);

  it('apagarlo lo deja como estaba', async () => {
    await guardar(0).expect(200);
    expect((await leer()).body.creditDefaultDays ?? null).toBeNull();
  }, 60000);
});
