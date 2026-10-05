import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { setupTestApp, teardownTestApp } from './helpers/setup';
import { crearTiendaDePerfumeria } from './helpers/perfumeria';

/**
 * **La tesorería cuenta desde una fecha.**
 *
 * Distri Amber cargó 643 abonos históricos en efectivo y el saldo decía
 * una plata que nunca estuvo en la caja. La tienda dice «desde el 1 de este
 * mes» y lo anterior no suma; el saldo real de ese día entra como un ajuste
 * fechado ahí. Tienda propia para que la zapatería de las demás pruebas no
 * cambie.
 */
describe('Tesorería desde una fecha (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let token: string;
  let tenantId: string;
  const ts = Date.now();
  const h = () => ({ Authorization: `Bearer ${token}` });

  const hoy = new Date();
  const primeroDelMes = `${hoy.getUTCFullYear()}-${String(hoy.getUTCMonth() + 1).padStart(2, '0')}-01`;
  const mesPasado = new Date(
    Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - 1, 15, 17, 0, 0),
  );

  const saldos = async () => {
    const r = await request(app.getHttpServer())
      .get('/api/incomes/summary')
      .set(h())
      .expect(200);
    const efectivo = (
      r.body.byMethod as { method: string | null; balance: number }[]
    ).find((m) => m.method === 'EFECTIVO');
    return {
      efectivo: efectivo?.balance ?? 0,
      aviso: r.body.aviso as string | null,
      desde: r.body.desde,
    };
  };

  beforeAll(async () => {
    app = await setupTestApp();
    ds = app.get(DataSource);
    ({ tenantId, token } = await crearTiendaDePerfumeria(app, ts));

    // Un abono viejo en efectivo (el mes pasado) a una factura a crédito.
    const wh = await request(app.getHttpServer())
      .post('/api/inventory/warehouses')
      .set(h())
      .send({
        name: `E2E TES ${ts}`,
        code: `TS-${ts.toString().slice(-5)}`,
        isPosLocation: true,
      })
      .expect(201);
    await request(app.getHttpServer())
      .patch('/api/store-settings')
      .set(h())
      .send({ defaultWarehouseId: wh.body.id })
      .expect(200);
    const p = await request(app.getHttpServer())
      .post('/api/products')
      .set(h())
      .send({
        name: `E2ETES loción ${ts}`,
        basePrice: 100000,
        variants: [{ size: 'Única', color: 'Único' }],
      })
      .expect(201);
    const variantId = p.body.variants[0].id as string;
    await request(app.getHttpServer())
      .post('/api/inventory/adjust')
      .set(h())
      .send({
        variantId,
        warehouseId: wh.body.id,
        quantity: 5,
        movementType: 'ADJUSTMENT',
        notes: 'e2e',
      })
      .expect(201);
    const c = await request(app.getHttpServer())
      .post('/api/clients')
      .set(h())
      .send({
        firstName: 'Cliente',
        lastName: `Tes ${ts}`,
        phone: `3${ts.toString().slice(-9)}`,
      })
      .expect(201);
    const venta = await request(app.getHttpServer())
      .post('/api/pos/sales')
      .set(h())
      .send({
        clientId: c.body.id,
        warehouseId: wh.body.id,
        items: [{ variantId, quantity: 1, unitPrice: 100000 }],
        payments: [{ method: 'CREDITO', amount: 100000 }],
        creditDueDate: '2027-01-01',
      })
      .expect(201);
    const detalle = await request(app.getHttpServer())
      .get(`/api/pos/sales/${venta.body.id}`)
      .set(h())
      .expect(200);
    const arId = detalle.body.accountsReceivable[0].id as string;
    await request(app.getHttpServer())
      .post(`/api/pos/accounts-receivable/${arId}/payment`)
      .set(h())
      .send({ amount: 100000, method: 'EFECTIVO' })
      .expect(201);
    // Se fecha el mes pasado: es el abono histórico que ensuciaba el saldo.
    await ds.query(
      `UPDATE accounts_receivable_payments SET created_at = $2 WHERE tenant_id = $1`,
      [tenantId, mesPasado],
    );
  });

  afterAll(async () => {
    await teardownTestApp();
  });

  it('sin fecha configurada, el abono viejo cuenta y no hay aviso', async () => {
    const s = await saldos();
    expect(s.efectivo).toBe(100000);
    expect(s.aviso).toBeNull();
  });

  it('con «desde el 1 de este mes», solo cuenta el saldo inicial cargado ese día', async () => {
    await request(app.getHttpServer())
      .patch('/api/store-settings')
      .set(h())
      .send({ tesoreriaDesde: primeroDelMes })
      .expect(200);
    const cfg = await request(app.getHttpServer())
      .get('/api/store-settings')
      .set(h())
      .expect(200);
    expect(cfg.body.tesoreriaDesde).toBe(primeroDelMes);

    await request(app.getHttpServer())
      .post('/api/incomes/adjustment')
      .set(h())
      .send({
        amount: 500000,
        method: 'EFECTIVO',
        note: 'Saldo inicial',
        fecha: primeroDelMes,
      })
      .expect(201);

    const s = await saldos();
    expect(s.efectivo).toBe(500000);
    expect(s.desde).toBe(primeroDelMes);
    expect(s.aviso).toMatch(/^Contando desde el 1 de /);

    // El listado de movimientos tampoco enseña nada anterior, y sí el ajuste.
    const lista = await request(app.getHttpServer())
      .get('/api/incomes')
      .set(h())
      .expect(200);
    const datos = lista.body.data as { note: string; createdAt: string }[];
    expect(datos.some((e) => e.note === 'Saldo inicial')).toBe(true);
    expect(
      datos.every(
        (e) => new Date(e.createdAt) >= new Date(`${primeroDelMes}T05:00:00Z`),
      ),
    ).toBe(true);
  });

  it('un ajuste fechado antes del piso no cuenta', async () => {
    await request(app.getHttpServer())
      .post('/api/incomes/adjustment')
      .set(h())
      .send({
        amount: 999999,
        method: 'EFECTIVO',
        note: 'Viejo',
        fecha: '2020-01-01',
      })
      .expect(201);
    expect((await saldos()).efectivo).toBe(500000);
  });

  it('quitar la fecha vuelve a sumar todo', async () => {
    await request(app.getHttpServer())
      .patch('/api/store-settings')
      .set(h())
      .send({ tesoreriaDesde: null })
      .expect(200);
    const s = await saldos();
    expect(s.efectivo).toBe(100000 + 500000 + 999999);
    expect(s.aviso).toBeNull();
  });

  it('una fecha mal escrita se rechaza', async () => {
    await request(app.getHttpServer())
      .patch('/api/store-settings')
      .set(h())
      .send({ tesoreriaDesde: '01/10/2026' })
      .expect(400);
  });
});
