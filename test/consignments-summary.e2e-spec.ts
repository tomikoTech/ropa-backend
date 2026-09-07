import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { setupTestApp, loginAsAdmin, teardownTestApp } from './helpers/setup';

/**
 * El resumen de Terceros tiene que hablar de **lo que se está viendo**.
 *
 * Antes solo respetaba el rango de fechas: al filtrar por un tercero el listado
 * mostraba sus ventas pero las tarjetas de arriba seguían sumando las de todos,
 * y «¿cuánto le debo a este?» —la pregunta por la que se abre esa pantalla— no
 * se podía contestar sin sacar la calculadora.
 */
describe('Terceros: el resumen respeta el filtro (e2e)', () => {
  let app: INestApplication;
  let token: string;
  const suffix = Date.now();
  const A = `E2E Tercero A ${suffix}`;
  const B = `E2E Tercero B ${suffix}`;

  const auth = () => ({ Authorization: `Bearer ${token}` });

  const venta = (
    thirdPartyName: string,
    datos: Record<string, unknown> = {},
  ) =>
    request(app.getHttpServer())
      .post('/api/consignments')
      .set(auth())
      .send({
        thirdPartyName,
        productDescription: `Zapato ${suffix}`,
        quantity: 1,
        costPrice: 100000,
        salePrice: 150000,
        ...datos,
      })
      .expect(201);

  const resumen = (qs = '') =>
    request(app.getHttpServer())
      .get(`/api/consignments/summary${qs}`)
      .set(auth())
      .expect(200)
      .then((r) => r.body);

  beforeAll(async () => {
    app = await setupTestApp();
    token = await loginAsAdmin(app);

    // A: dos ventas, ninguna pagada al tercero → le debemos 200.000.
    await venta(A);
    await venta(A);
    // B: una venta, ya pagada al tercero → no le debemos nada.
    await venta(B, { supplierPaid: true });
  });

  afterAll(async () => {
    await teardownTestApp(app);
  });

  it('sin filtro, suma los dos terceros', async () => {
    const r = await resumen();
    const a = r.byThirdParty.find((x: { thirdPartyName: string }) => x.thirdPartyName === A);
    const b = r.byThirdParty.find((x: { thirdPartyName: string }) => x.thirdPartyName === B);
    expect(a.count).toBe(2);
    expect(b.count).toBe(1);
  });

  it('filtrando por un tercero, el saldo es SOLO el de ese tercero', async () => {
    const r = await resumen(`?search=${encodeURIComponent(A)}`);
    expect(r.count).toBe(2);
    expect(r.owedToThirdParties).toBe(200000);
    expect(r.totalProfit).toBe(100000);
    expect(r.byThirdParty).toHaveLength(1);
    expect(r.byThirdParty[0].thirdPartyName).toBe(A);
  });

  it('el tercero que ya está pagado no arrastra saldo', async () => {
    const r = await resumen(`?search=${encodeURIComponent(B)}`);
    expect(r.count).toBe(1);
    expect(r.owedToThirdParties).toBe(0);
  });

  it('el resumen cuenta lo MISMO que el listado, con el mismo filtro', async () => {
    const qs = `?search=${encodeURIComponent(A)}`;
    const [r, lista] = await Promise.all([
      resumen(qs),
      request(app.getHttpServer())
        .get(`/api/consignments${qs}&limit=200`)
        .set(auth())
        .expect(200)
        .then((x) => x.body),
    ]);
    expect(r.count).toBe(lista.total);
  });

  it('los filtros se acumulan: tercero + solo lo que le debo', async () => {
    const r = await resumen(
      `?search=${encodeURIComponent(A)}&supplierPaid=false`,
    );
    expect(r.count).toBe(2);
    const pagado = await resumen(
      `?search=${encodeURIComponent(A)}&supplierPaid=true`,
    );
    expect(pagado.count).toBe(0);
    expect(pagado.owedToThirdParties).toBe(0);
  });

  it('un tercero que no existe no devuelve nada, no el total', async () => {
    const r = await resumen(`?search=NoExisteEsteTercero${suffix}`);
    expect(r.count).toBe(0);
    expect(r.owedToThirdParties).toBe(0);
    expect(r.byThirdParty).toEqual([]);
  });
});
