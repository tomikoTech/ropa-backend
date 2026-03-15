import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Suppliers (e2e)', () => {
  let app: INestApplication;
  let authToken: string;
  let supplierId: string;
  const uniqueName = `E2E Supplier ${Date.now()}`;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'tuchapato@gmail.com', password: 'tuchapato123' });
    authToken = res.body.accessToken;
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  it('POST /api/suppliers - should create a supplier', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/suppliers')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: uniqueName,
        nit: '900999888-1',
        contactName: 'Juan E2E',
        email: 'juan-e2e@test.co',
        phone: '3009999999',
        address: 'Calle E2E #1-1',
      })
      .expect(201);

    expect(res.body).toHaveProperty('id');
    expect(res.body.name).toBe(uniqueName);
    expect(res.body.nit).toBe('900999888-1');
    expect(res.body.contactName).toBe('Juan E2E');
    expect(res.body.email).toBe('juan-e2e@test.co');
    expect(res.body.phone).toBe('3009999999');
    supplierId = res.body.id;
  });

  it('GET /api/suppliers - should return list containing created supplier', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/suppliers')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    const found = res.body.find((s: any) => s.id === supplierId);
    expect(found).toBeDefined();
    expect(found.name).toBe(uniqueName);
  });

  it('GET /api/suppliers/:id - should return supplier by id', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/suppliers/${supplierId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(res.body.id).toBe(supplierId);
    expect(res.body.name).toBe(uniqueName);
  });

  it('GET /api/suppliers/search?q= - should search suppliers', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/suppliers/search')
      .query({ q: uniqueName.slice(0, 12) })
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    const found = res.body.find((s: any) => s.id === supplierId);
    expect(found).toBeDefined();
  });

  it('PUT /api/suppliers/:id - should update supplier', async () => {
    const updatedName = `${uniqueName} Updated`;
    const res = await request(app.getHttpServer())
      .put(`/api/suppliers/${supplierId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: updatedName,
        phone: '3001111111',
      })
      .expect(200);

    expect(res.body.name).toBe(updatedName);
    expect(res.body.phone).toBe('3001111111');
  });

  it('DELETE /api/suppliers/:id - should delete supplier', async () => {
    await request(app.getHttpServer())
      .delete(`/api/suppliers/${supplierId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    // Verify supplier no longer found
    await request(app.getHttpServer())
      .get(`/api/suppliers/${supplierId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(404);
  });

  it('POST /api/suppliers - should reject invalid data', async () => {
    await request(app.getHttpServer())
      .post('/api/suppliers')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ email: 'not-an-email' })
      .expect(400);
  });
});
