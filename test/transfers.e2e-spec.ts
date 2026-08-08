import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { setupTestApp, loginAsAdmin, teardownTestApp } from './helpers/setup';

// F3+F4: remisiones con confirmación + préstamos rápidos.
describe('Stock transfers / remisiones y préstamos (e2e)', () => {
  let app: INestApplication;
  let token: string;
  const suffix = Date.now();

  let variantId: string;
  let whA: string; // origen (bodega principal)
  let whB: string; // destino (local)

  const auth = () => ({ Authorization: `Bearer ${token}` });

  const stockAt = async (warehouseId: string): Promise<number> => {
    const res = await request(app.getHttpServer())
      .get(`/api/inventory/stock/variant/${variantId}`)
      .set(auth())
      .expect(200);
    const row = res.body.find(
      (s: any) =>
        s.warehouseId === warehouseId || s.warehouse?.id === warehouseId,
    );
    return row ? Number(row.quantity) : 0;
  };

  const setFlags = (flags: Record<string, boolean>) =>
    request(app.getHttpServer())
      .patch('/api/store-settings')
      .set(auth())
      .send(flags)
      .expect(200);

  beforeAll(async () => {
    app = await setupTestApp();
    token = await loginAsAdmin(app);

    const p = await request(app.getHttpServer())
      .post('/api/products')
      .set(auth())
      .send({
        name: `E2E Transfer Product ${suffix}`,
        basePrice: 60000,
        costPrice: 30000,
        taxRate: 19,
        variants: [{ size: '43', color: 'Azul' }],
      })
      .expect(201);
    variantId = p.body.variants[0].id;

    const a = await request(app.getHttpServer())
      .post('/api/inventory/warehouses')
      .set(auth())
      .send({
        name: `E2E TR A ${suffix}`,
        code: `TRA-${suffix}`,
        isPosLocation: true,
      })
      .expect(201);
    whA = a.body.id;
    const b = await request(app.getHttpServer())
      .post('/api/inventory/warehouses')
      .set(auth())
      .send({
        name: `E2E TR B ${suffix}`,
        code: `TRB-${suffix}`,
        isPosLocation: true,
      })
      .expect(201);
    whB = b.body.id;

    await request(app.getHttpServer())
      .post('/api/inventory/adjust')
      .set(auth())
      .send({
        variantId,
        warehouseId: whA,
        quantity: 10,
        movementType: 'IN',
        notes: 'stock',
      })
      .expect(201);
  }, 60000);

  afterAll(async () => {
    // Restaurar los flags a OFF para no contaminar otras suites (estado compartido).
    await request(app.getHttpServer())
      .patch('/api/store-settings')
      .set(auth())
      .send({ transferConfirmationEnabled: false, quickLoanEnabled: false })
      .catch(() => {});
    await teardownTestApp();
  });

  // ── No-regresión: con los flags OFF, el traslado es inmediato ──
  it('flags OFF → POST /inventory/transfer mueve stock inmediato (from/to)', async () => {
    await setFlags({
      transferConfirmationEnabled: false,
      quickLoanEnabled: false,
    });
    const res = await request(app.getHttpServer())
      .post('/api/inventory/transfer')
      .set(auth())
      .send({
        variantId,
        fromWarehouseId: whA,
        toWarehouseId: whB,
        quantity: 2,
      })
      .expect(201);
    // Respuesta inmediata { from, to } (no una remisión).
    expect(res.body.from).toBeDefined();
    expect(res.body.to).toBeDefined();
    expect(await stockAt(whA)).toBe(8);
    expect(await stockAt(whB)).toBe(2);
  });

  // ── F3: traslado con confirmación ──
  it('flag ON → transfer queda PENDING; el destino NO recibe hasta confirmar', async () => {
    await setFlags({ transferConfirmationEnabled: true });
    const beforeB = await stockAt(whB);
    const res = await request(app.getHttpServer())
      .post('/api/inventory/transfer')
      .set(auth())
      .send({
        variantId,
        fromWarehouseId: whA,
        toWarehouseId: whB,
        quantity: 3,
      })
      .expect(201);
    expect(res.body.status).toBe('PENDING');
    // Salió de A (en tránsito), NO llegó a B todavía.
    expect(await stockAt(whA)).toBe(5);
    expect(await stockAt(whB)).toBe(beforeB);

    const transferId = res.body.id;
    await request(app.getHttpServer())
      .post(`/api/inventory/transfers/${transferId}/receive`)
      .set(auth())
      .expect(201);
    expect(await stockAt(whB)).toBe(beforeB + 3);
  });

  it('cancelar una remisión pendiente devuelve el stock al origen', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/inventory/transfer')
      .set(auth())
      .send({
        variantId,
        fromWarehouseId: whA,
        toWarehouseId: whB,
        quantity: 2,
      })
      .expect(201);
    const beforeA = await stockAt(whA); // ya descontado
    await request(app.getHttpServer())
      .post(`/api/inventory/transfers/${res.body.id}/cancel`)
      .set(auth())
      .expect(201);
    expect(await stockAt(whA)).toBe(beforeA + 2);
  });

  // ── F4: préstamo rápido con retorno ──
  it('préstamo mueve stock inmediato al destino y se puede retornar', async () => {
    await setFlags({ quickLoanEnabled: true });
    const a0 = await stockAt(whA);
    const b0 = await stockAt(whB);

    const loan = await request(app.getHttpServer())
      .post('/api/inventory/loans')
      .set(auth())
      .send({
        variantId,
        fromWarehouseId: whA,
        toWarehouseId: whB,
        quantity: 1,
      })
      .expect(201);
    expect(loan.body.type).toBe('LOAN');
    expect(loan.body.status).toBe('PENDING');
    expect(await stockAt(whA)).toBe(a0 - 1);
    expect(await stockAt(whB)).toBe(b0 + 1);

    await request(app.getHttpServer())
      .post(`/api/inventory/loans/${loan.body.id}/return`)
      .set(auth())
      .expect(201);
    expect(await stockAt(whA)).toBe(a0);
    expect(await stockAt(whB)).toBe(b0);
  });

  it('GET /inventory/transfers lista remisiones y préstamos', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/inventory/transfers')
      .set(auth())
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('la petición puede decidir la confirmación, sin depender del ajuste', async () => {
    // El ajuste sigue mandando cuando no se dice nada, pero la operación puede
    // pedir lo contrario: es lo que evita que dos suites (o dos pantallas) se
    // pisen a través de una configuración global.
    await setFlags({ transferConfirmationEnabled: false });

    const pendiente = await request(app.getHttpServer())
      .post('/api/inventory/transfer')
      .set(auth())
      .send({
        variantId,
        fromWarehouseId: whA,
        toWarehouseId: whB,
        quantity: 1,
        requireConfirmation: true,
      })
      .expect(201);
    expect(pendiente.body.status).toBe('PENDING');

    await setFlags({ transferConfirmationEnabled: true });

    const inmediato = await request(app.getHttpServer())
      .post('/api/inventory/transfer')
      .set(auth())
      .send({
        variantId,
        fromWarehouseId: whA,
        toWarehouseId: whB,
        quantity: 1,
        requireConfirmation: false,
      })
      .expect(201);
    // El traslado inmediato devuelve los dos stocks, no una remisión.
    expect(inmediato.body.from).toBeDefined();
    expect(inmediato.body.to).toBeDefined();

    await setFlags({ transferConfirmationEnabled: false });
  });
});
