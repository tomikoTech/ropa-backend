import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { tryLogin } from './helpers/login';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

describe('Egresos y caja menor (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let categoryId: string;
  let pettyCashId: string;
  let bankId: string;

  const ts = Date.now();
  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    token = await tryLogin(app);

    const bank = await request(app.getHttpServer())
      .post('/api/banks')
      .set(auth())
      .send({ name: `Banco egresos ${ts}` })
      .expect(201);
    bankId = bank.body.id;
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  it('crea un tipo de gasto', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/expenses/categories')
      .set(auth())
      .send({ name: `Servicios ${ts}` })
      .expect(201);

    categoryId = res.body.id;
    expect(res.body.name).toBe(`Servicios ${ts}`);
  });

  it('rechaza un tipo de gasto repetido', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/expenses/categories')
      .set(auth())
      .send({ name: `Servicios ${ts}` });

    expect(res.status).toBe(409);
  });

  it('registra un gasto con consecutivo', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/expenses')
      .set(auth())
      .send({
        description: 'Recibo de energía',
        amount: 250000,
        categoryId,
      })
      .expect(201);

    expect(res.body.expenseNumber).toMatch(/^GA-\d{6}$/);
    expect(Number(res.body.amount)).toBe(250000);
    expect(res.body.paymentMethod).toBe('EFECTIVO');
  });

  it('registra forma de pago, banco y notas y los descuenta de tesorería', async () => {
    const before = await request(app.getHttpServer())
      .get('/api/incomes/summary')
      .set(auth())
      .expect(200);
    const amount = 45678;

    const expense = await request(app.getHttpServer())
      .post('/api/expenses')
      .set(auth())
      .send({
        description: 'Servicio pagado por banco',
        amount,
        paymentMethod: 'TRANSFERENCIA',
        bankId,
        notes: '  Comprobante 9087  ',
      })
      .expect(201);

    expect(expense.body.paymentMethod).toBe('TRANSFERENCIA');
    expect(expense.body.bankId).toBe(bankId);
    expect(expense.body.notes).toBe('Comprobante 9087');

    const after = await request(app.getHttpServer())
      .get('/api/incomes/summary')
      .set(auth())
      .expect(200);
    const beforeBank = before.body.byBank.find(
      (row: { bankId: string | null }) => row.bankId === bankId,
    );
    const afterBank = after.body.byBank.find(
      (row: { bankId: string | null }) => row.bankId === bankId,
    );
    const beforeMethod = before.body.byMethod.find(
      (row: { method: string | null }) => row.method === 'TRANSFERENCIA',
    );
    const afterMethod = after.body.byMethod.find(
      (row: { method: string | null }) => row.method === 'TRANSFERENCIA',
    );

    expect(after.body.totals.egresos - before.body.totals.egresos).toBe(amount);
    expect(after.body.totals.balance - before.body.totals.balance).toBe(
      -amount,
    );
    expect(afterBank.egresos - (beforeBank?.egresos ?? 0)).toBe(amount);
    expect(afterBank.balance - (beforeBank?.balance ?? 0)).toBe(-amount);
    expect(afterMethod.egresos - (beforeMethod?.egresos ?? 0)).toBe(amount);
  });

  it('exige banco para transferencia y lo rechaza en efectivo', async () => {
    const withoutBank = await request(app.getHttpServer())
      .post('/api/expenses')
      .set(auth())
      .send({
        description: 'Transferencia incompleta',
        amount: 10000,
        paymentMethod: 'TRANSFERENCIA',
      });
    expect(withoutBank.status).toBe(400);
    expect(String(withoutBank.body.message)).toMatch(/selecciona el banco/i);

    const cashWithBank = await request(app.getHttpServer())
      .post('/api/expenses')
      .set(auth())
      .send({
        description: 'Efectivo inconsistente',
        amount: 10000,
        paymentMethod: 'EFECTIVO',
        bankId,
      });
    expect(cashWithBank.status).toBe(400);
    expect(String(cashWithBank.body.message)).toMatch(/efectivo.*banco/i);
  });

  it('el consecutivo avanza sin repetirse', async () => {
    const a = await request(app.getHttpServer())
      .post('/api/expenses')
      .set(auth())
      .send({ description: 'Papelería', amount: 30000 })
      .expect(201);
    const b = await request(app.getHttpServer())
      .post('/api/expenses')
      .set(auth())
      .send({ description: 'Aseo', amount: 20000 })
      .expect(201);

    expect(a.body.expenseNumber).not.toBe(b.body.expenseNumber);
    expect(Number(b.body.expenseNumber.slice(3))).toBeGreaterThan(
      Number(a.body.expenseNumber.slice(3)),
    );
  });

  it('lista los gastos con su total', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/expenses')
      .set(auth())
      .expect(200);

    expect(res.body.items.length).toBeGreaterThanOrEqual(3);
    expect(res.body.total).toBeGreaterThanOrEqual(300000);
  });

  it('no deja eliminar un tipo de gasto en uso', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/expenses/categories/${categoryId}`)
      .set(auth());

    expect(res.status).toBe(409);
    expect(String(res.body.message)).toMatch(/lo usan 1 gasto/i);
  });

  // ── Caja menor ──

  it('crea una caja menor con su fondo', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/expenses/petty-cash')
      .set(auth())
      .send({ name: `Caja menor ${ts}`, fundedAmount: 500000 })
      .expect(201);

    pettyCashId = res.body.id;
    expect(Number(res.body.fundedAmount)).toBe(500000);
  });

  it('el saldo se calcula descontando lo gastado', async () => {
    await request(app.getHttpServer())
      .post('/api/expenses')
      .set(auth())
      .send({ description: 'Taxi', amount: 20000, pettyCashId })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get('/api/expenses/petty-cash')
      .set(auth())
      .expect(200);

    const caja = res.body.find((c: { id: string }) => c.id === pettyCashId);
    expect(caja.spent).toBe(20000);
    expect(caja.balance).toBe(480000);
  });

  // Sin esto se podría sacar de la caja más de lo que tiene y el arqueo
  // nunca cuadraría.
  it('no deja gastar más de lo que hay en la caja menor', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/expenses')
      .set(auth())
      .send({ description: 'Gasto grande', amount: 900000, pettyCashId });

    expect(res.status).toBe(400);
    expect(String(res.body.message)).toMatch(/solo tiene 480000/i);
  });

  it('reponer el fondo aumenta el saldo disponible', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/expenses/petty-cash/${pettyCashId}/fund`)
      .set(auth())
      .send({ amount: 100000 })
      .expect(201);

    expect(res.body.balance).toBe(580000);
  });
});
