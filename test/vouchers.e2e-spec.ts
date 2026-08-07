import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { tryLogin } from './helpers/login';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { isValidBarcode } from '../src/inventory/barcode.util';

describe('Bonos / cupones (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let voucher: { id: string; barcode: string; amount: string };

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
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  it('emite un bono con código escaneable', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/vouchers')
      .set(auth())
      .send({ amount: 50000, comment: 'E2E bono' })
      .expect(201);

    expect(res.body).toHaveLength(1);
    voucher = res.body[0];
    expect(Number(voucher.amount)).toBe(50000);
    // Lleva dígito verificador para poder escanearlo como un producto.
    expect(isValidBarcode(voucher.barcode)).toBe(true);
  });

  it('emite varios bonos iguales con códigos distintos', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/vouchers')
      .set(auth())
      .send({ amount: 10000, quantity: 5 })
      .expect(201);

    const codes = res.body.map((v: { barcode: string }) => v.barcode);
    expect(codes).toHaveLength(5);
    expect(new Set(codes).size).toBe(5);
  });

  it('consulta un bono por su código antes de aplicarlo', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/vouchers/check/${voucher.barcode}`)
      .set(auth())
      .expect(200);

    expect(Number(res.body.amount)).toBe(50000);
    expect(res.body.status).toBe('ACTIVE');
  });

  it('avisa cuando el código no existe', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/vouchers/check/00000000000000')
      .set(auth());

    expect(res.status).toBe(404);
    expect(String(res.body.message)).toMatch(/no existe un bono/i);
  });

  it('canjea el bono', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/vouchers/redeem')
      .set(auth())
      .send({ barcode: voucher.barcode })
      .expect(201);

    expect(res.body.status).toBe('REDEEMED');
    expect(res.body.redeemedAt).toBeTruthy();
  });

  // Un bono es dinero: si se pudiera canjear dos veces, la tienda pierde.
  it('no deja canjear dos veces el mismo bono', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/vouchers/redeem')
      .set(auth())
      .send({ barcode: voucher.barcode });

    expect(res.status).toBe(400);
    expect(String(res.body.message)).toMatch(/ya fue canjeado/i);
  });

  it('un bono canjeado tampoco se puede eliminar', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/vouchers/${voucher.id}`)
      .set(auth());

    expect(res.status).toBe(400);
    expect(String(res.body.message)).toMatch(/quedaría sin rastro/i);
  });

  it('rechaza un bono vencido explicando la fecha', async () => {
    const vencido = await request(app.getHttpServer())
      .post('/api/vouchers')
      .set(auth())
      .send({ amount: 1000, expiresAt: '2020-01-01T00:00:00.000Z' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/api/vouchers/check/${vencido.body[0].barcode}`)
      .set(auth());

    expect(res.status).toBe(400);
    expect(String(res.body.message)).toMatch(/venció/i);
  });

  it('un bono desactivado no se puede usar, pero se puede reactivar', async () => {
    const nuevo = await request(app.getHttpServer())
      .post('/api/vouchers')
      .set(auth())
      .send({ amount: 2000 })
      .expect(201);
    const id = nuevo.body[0].id;
    const code = nuevo.body[0].barcode;

    await request(app.getHttpServer())
      .patch(`/api/vouchers/${id}/disable`)
      .set(auth())
      .expect(200);

    const bloqueado = await request(app.getHttpServer())
      .get(`/api/vouchers/check/${code}`)
      .set(auth());
    expect(bloqueado.status).toBe(400);
    expect(String(bloqueado.body.message)).toMatch(/desactivado/i);

    await request(app.getHttpServer())
      .patch(`/api/vouchers/${id}/activate`)
      .set(auth())
      .expect(200);

    await request(app.getHttpServer())
      .get(`/api/vouchers/check/${code}`)
      .set(auth())
      .expect(200);
  });
});
