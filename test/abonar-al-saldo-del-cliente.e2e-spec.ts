import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { setupTestApp, loginAsAdmin, teardownTestApp } from './helpers/setup';

/**
 * **Abonar al saldo del cliente, sin ajustes previos.**
 *
 * La función existía desde hace rato y no la tenía nadie: estaba detrás de un
 * interruptor (`ar_payment_allocation_mode`) que había que encender, y estaba
 * **apagado en los diez tenants**. El botón salía escondido y quien llegara
 * por la API recibía «la aplicación automática FIFO no está habilitada».
 *
 * Esta prueba fija que ya no hace falta encender nada: se elige al cliente, se
 * abona, y se reparte desde la factura más vieja. Tres ventas, porque con dos
 * un reparto al revés se ve igual que uno correcto la mitad de las veces.
 */
describe('Abonar al saldo del cliente (e2e)', () => {
  let app: INestApplication;
  let token: string;
  const ts = Date.now();
  const auth = () => ({ Authorization: `Bearer ${token}` });

  let clientId: string;
  let variantId: string;
  let warehouseId: string;
  /** Las tres ventas a crédito, de la más vieja a la más nueva. */
  let ventas: { id: string; arId: string }[] = [];

  const venderACredito = async (cantidad: number, precio: number) => {
    const r = await request(app.getHttpServer())
      .post('/api/pos/sales')
      .set(auth())
      .send({
        clientId,
        warehouseId,
        items: [{ variantId, quantity: cantidad, unitPrice: precio }],
        payments: [{ method: 'CREDITO', amount: cantidad * precio }],
        creditDueDate: '2026-12-31',
      })
      .expect(201);
    // La cuenta por cobrar se lee del detalle: la respuesta de crear la venta
    // no la trae, y dar por hecho que sí es lo que hizo fallar esto primero.
    const detalle = await request(app.getHttpServer())
      .get(`/api/pos/sales/${r.body.id}`)
      .set(auth())
      .expect(200);
    return {
      id: r.body.id as string,
      arId: detalle.body.accountsReceivable[0].id as string,
    };
  };

  const saldoDe = async (arId: string) => {
    const r = await request(app.getHttpServer())
      .get(`/api/pos/accounts-receivable/${arId}`)
      .set(auth())
      .expect(200);
    return {
      pagado: Number(r.body.paidAmount),
      saldada: !!r.body.isFullyPaid,
    };
  };

  beforeAll(async () => {
    app = await setupTestApp();
    token = await loginAsAdmin(app);

    const cli = await request(app.getHttpServer())
      .post('/api/clients')
      .set(auth())
      .send({
        firstName: 'E2E Saldo',
        lastName: `Cliente ${ts}`,
        documentNumber: `DOC-${ts}`,
        phone: `300${ts.toString().slice(-7)}`,
      })
      .expect(201);
    clientId = cli.body.id;

    const wh = await request(app.getHttpServer())
      .post('/api/inventory/warehouses')
      .set(auth())
      .send({
        name: `E2E Saldo WH ${ts}`,
        code: `SA-${ts.toString().slice(-5)}`,
        isPosLocation: true,
      })
      .expect(201);
    warehouseId = wh.body.id;

    const prod = await request(app.getHttpServer())
      .post('/api/products')
      .set(auth())
      .send({
        name: `E2ESALD Producto ${ts}`,
        basePrice: 10000,
        costPrice: 4000,
        variants: [{ size: 'U', color: 'Negro' }],
      })
      .expect(201);
    variantId = prod.body.variants[0].id;

    await request(app.getHttpServer())
      .post('/api/inventory/adjust')
      .set(auth())
      .send({
        variantId,
        warehouseId,
        quantity: 200,
        movementType: 'IN',
        notes: 'Carga inicial de la prueba',
      })
      .expect((r) => {
        if (r.status !== 200 && r.status !== 201) {
          throw new Error(`No se pudo cargar stock: ${r.status} ${r.text}`);
        }
      });

    // 100.000 · 200.000 · 300.000, en ese orden.
    ventas = [
      await venderACredito(10, 10_000),
      await venderACredito(20, 10_000),
      await venderACredito(30, 10_000),
    ];
  }, 180000);

  afterAll(async () => {
    await teardownTestApp();
  });

  it('abona sin que haya que encender ningún ajuste', async () => {
    // Este es el caso que devolvía 400 en los diez tenants.
    const r = await request(app.getHttpServer())
      .post(`/api/pos/accounts-receivable/clients/${clientId}/balance-payment`)
      .set(auth())
      .send({ amount: 150_000, method: 'EFECTIVO' })
      .expect(201);

    expect(r.body.allocations).toHaveLength(2);
  }, 60000);

  it('y se reparte desde la factura más vieja', async () => {
    expect(await saldoDe(ventas[0].arId)).toMatchObject({
      pagado: 100_000,
      saldada: true,
    });
    expect(await saldoDe(ventas[1].arId)).toMatchObject({
      pagado: 50_000,
      saldada: false,
    });
    // La tercera, intacta: es lo que distingue un reparto de uno al revés.
    expect(await saldoDe(ventas[2].arId)).toMatchObject({
      pagado: 0,
      saldada: false,
    });
  }, 60000);

  it('sigue sin dejar cobrar más de lo que se debe', async () => {
    const r = await request(app.getHttpServer())
      .post(`/api/pos/accounts-receivable/clients/${clientId}/balance-payment`)
      .set(auth())
      .send({ amount: 999_999_999, method: 'EFECTIVO' })
      .expect(400);
    expect(r.body.message).toContain('excede el saldo pendiente');
    // Y el rechazo no dejó nada a medias.
    expect(await saldoDe(ventas[1].arId)).toMatchObject({ pagado: 50_000 });
  }, 60000);
});
