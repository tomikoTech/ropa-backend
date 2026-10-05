import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { setupTestApp, loginAsAdmin, teardownTestApp } from './helpers/setup';

/**
 * **Corregir cómo entró un abono, y que Tesorería lo vea.**
 *
 * Un abono que se registró en efectivo pero fue por Nequi: se corrige el
 * método y el banco, el saldo de ese banco sube, y el de efectivo baja. Sin
 * banco no pasa; sobre un abono deshecho tampoco.
 */
describe('Corregir abono (e2e)', () => {
  let app: INestApplication;
  let token: string;
  const ts = Date.now();
  const h = () => ({ Authorization: `Bearer ${token}` });
  let warehouseId: string;
  let variantId: string;
  let clientId: string;
  let bankId: string;
  let arId: string;

  const saldoDelBanco = async (id: string | null) => {
    const r = await request(app.getHttpServer())
      .get('/api/incomes/summary')
      .set(h())
      .expect(200);
    const fila = (
      r.body.byBank as { bankId: string | null; balance: number }[]
    ).find((b) => b.bankId === id);
    return Number(fila?.balance ?? 0);
  };

  beforeAll(async () => {
    app = await setupTestApp();
    token = await loginAsAdmin(app);
    const wh = await request(app.getHttpServer())
      .post('/api/inventory/warehouses')
      .set(h())
      .send({
        name: `E2E CA WH ${ts}`,
        code: `CA-${ts.toString().slice(-5)}`,
        isPosLocation: true,
      })
      .expect(201);
    warehouseId = wh.body.id;
    const p = await request(app.getHttpServer())
      .post('/api/products')
      .set(h())
      .send({
        name: `E2ECA producto ${ts}`,
        basePrice: 10000,
        variants: [{ size: 'U', color: 'Único' }],
      })
      .expect(201);
    variantId = p.body.variants[0].id;
    await request(app.getHttpServer())
      .post('/api/inventory/adjust')
      .set(h())
      .send({ variantId, warehouseId, quantity: 10, movementType: 'IN', notes: 'e2e' })
      .expect((r) => {
        if (r.status !== 200 && r.status !== 201) throw new Error(r.text);
      });
    const c = await request(app.getHttpServer())
      .post('/api/clients')
      .set(h())
      .send({ firstName: 'ROSA', lastName: `ABONO ${ts}`, phone: `311${ts.toString().slice(-7)}` })
      .expect(201);
    clientId = c.body.id;
    const b = await request(app.getHttpServer())
      .post('/api/banks')
      .set(h())
      .send({ name: `Nequi e2e ${ts}` })
      .expect(201);
    bankId = b.body.id;
    const venta = await request(app.getHttpServer())
      .post('/api/pos/sales')
      .set(h())
      .send({
        clientId,
        warehouseId,
        items: [{ variantId, quantity: 1, unitPrice: 80000 }],
        payments: [{ method: 'CREDITO', amount: 80000 }],
        creditDueDate: '2026-12-31',
      })
      .expect(201);
    const d = await request(app.getHttpServer())
      .get(`/api/pos/sales/${venta.body.id}`)
      .set(h())
      .expect(200);
    arId = d.body.accountsReceivable[0].id;
  }, 120000);

  afterAll(async () => {
    await teardownTestApp();
  });

  it('un abono en efectivo pasa a transferencia por Nequi y el banco lo refleja', async () => {
    const antesNequi = await saldoDelBanco(bankId);
    const antesCajon = await saldoDelBanco(null);
    const abono = await request(app.getHttpServer())
      .post(`/api/pos/accounts-receivable/${arId}/payment`)
      .set(h())
      .send({ amount: 30000, method: 'EFECTIVO', reference: 'RC-1' })
      .expect(201);
    const pago = (abono.body.payments as { id: string; method: string }[]).find(
      (p) => p.method === 'EFECTIVO',
    )!;
    expect(await saldoDelBanco(null)).toBe(antesCajon + 30000);

    // Transferencia sin banco: no.
    const sinBanco = await request(app.getHttpServer())
      .patch(`/api/pos/accounts-receivable/payment/${pago.id}`)
      .set(h())
      .send({ method: 'TRANSFERENCIA' })
      .expect(400);
    expect(sinBanco.body.message).toMatch(/banco/i);

    const r = await request(app.getHttpServer())
      .patch(`/api/pos/accounts-receivable/payment/${pago.id}`)
      .set(h())
      .send({ method: 'TRANSFERENCIA', bankId, reference: 'RC-404' })
      .expect(200);
    expect(r.body).toMatchObject({ method: 'TRANSFERENCIA', bankId, reference: 'RC-404' });
    expect(Number(r.body.amount)).toBe(30000);

    expect(await saldoDelBanco(bankId)).toBe(antesNequi + 30000);
    expect(await saldoDelBanco(null)).toBe(antesCajon);

    // El historial ya dice por dónde entró.
    const hist = await request(app.getHttpServer())
      .get(`/api/cartera/abonos?cuentaId=${arId}`)
      .set(h())
      .expect(200);
    const renglon = (hist.body.dias as { renglones: Record<string, unknown>[] }[])
      .flatMap((d) => d.renglones)
      .find((x) => x.id === pago.id)!;
    expect(renglon).toMatchObject({ metodo: 'TRANSFERENCIA', referencia: 'RC-404' });
    expect(renglon.bancoNombre).toContain('Nequi');

    // Volver a efectivo suelta el banco solo.
    const e = await request(app.getHttpServer())
      .patch(`/api/pos/accounts-receivable/payment/${pago.id}`)
      .set(h())
      .send({ method: 'EFECTIVO' })
      .expect(200);
    expect(e.body.bankId).toBeNull();
    expect(await saldoDelBanco(bankId)).toBe(antesNequi);
  }, 60000);

  it('un abono deshecho no se corrige', async () => {
    const abono = await request(app.getHttpServer())
      .post(`/api/pos/accounts-receivable/${arId}/payment`)
      .set(h())
      .send({ amount: 10000, method: 'EFECTIVO', reference: 'RC-2' })
      .expect(201);
    const pago = (abono.body.payments as { id: string; reference: string }[]).find(
      (p) => p.reference === 'RC-2',
    )!;
    await request(app.getHttpServer())
      .post(`/api/pos/accounts-receivable/${arId}/payment/${pago.id}/reverse`)
      .set(h())
      .send({})
      .expect(201);
    const r = await request(app.getHttpServer())
      .patch(`/api/pos/accounts-receivable/payment/${pago.id}`)
      .set(h())
      .send({ reference: 'RC-3' })
      .expect(400);
    expect(r.body.message).toMatch(/deshecho/i);
    // Y el contra-abono tampoco.
    const cuenta = await request(app.getHttpServer())
      .get(`/api/pos/accounts-receivable/${arId}`)
      .set(h())
      .expect(200);
    const contra = (cuenta.body.payments as { id: string; reversesPaymentId: string | null }[]).find(
      (p) => p.reversesPaymentId === pago.id,
    )!;
    await request(app.getHttpServer())
      .patch(`/api/pos/accounts-receivable/payment/${contra.id}`)
      .set(h())
      .send({ reference: 'RC-3' })
      .expect(400);
  }, 60000);
});
