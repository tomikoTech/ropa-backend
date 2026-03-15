import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { tryLogin } from './helpers/login';

describe('Promotions (e2e)', () => {
  let app: INestApplication;
  let authToken: string;
  let promotionId: string;
  let categoryId: string;

  const ts = Date.now();
  const uniqueName = `E2E Promo ${ts}`;

  // Dates: startDate = yesterday, endDate = 30 days from now (active window)
  const startDate = new Date(Date.now() - 86400000).toISOString();
  const endDate = new Date(Date.now() + 30 * 86400000).toISOString();

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

    authToken = await tryLogin(app);

    // Create a category for CATEGORY-scoped promotion test
    const catRes = await request(app.getHttpServer())
      .post('/api/categories')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: `E2E Promo Category ${ts}` });
    categoryId = catRes.body.id;
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  it('POST /api/promotions - should create a percentage promotion (ALL)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/promotions')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: uniqueName,
        description: 'E2E test promotion',
        discountType: 'PERCENTAGE',
        discountValue: 10,
        applicableTo: 'ALL',
        startDate,
        endDate,
        maxUses: 100,
      })
      .expect(201);

    expect(res.body).toHaveProperty('id');
    expect(res.body.name).toBe(uniqueName);
    expect(res.body.discountType).toBe('PERCENTAGE');
    expect(res.body.discountValue).toBe(10);
    expect(res.body.applicableTo).toBe('ALL');
    expect(res.body.isActive).toBe(true);
    promotionId = res.body.id;
  });

  it('GET /api/promotions - should return list containing created promotion', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/promotions')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    const found = res.body.find((p: any) => p.id === promotionId);
    expect(found).toBeDefined();
    expect(found.name).toBe(uniqueName);
  });

  it('GET /api/promotions/active - should return active promotions including ours', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/promotions/active')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    const found = res.body.find((p: any) => p.id === promotionId);
    expect(found).toBeDefined();
  });

  it('GET /api/promotions/:id - should return promotion by id', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/promotions/${promotionId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(res.body.id).toBe(promotionId);
    expect(res.body.name).toBe(uniqueName);
  });

  it('PUT /api/promotions/:id - should update to CATEGORY scope', async () => {
    const res = await request(app.getHttpServer())
      .put(`/api/promotions/${promotionId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        applicableTo: 'CATEGORY',
        applicableId: categoryId,
        discountValue: 15,
      })
      .expect(200);

    expect(res.body.applicableTo).toBe('CATEGORY');
    expect(res.body.applicableId).toBe(categoryId);
    expect(res.body.discountValue).toBe(15);
  });

  it('PUT /api/promotions/:id - should deactivate promotion', async () => {
    const res = await request(app.getHttpServer())
      .put(`/api/promotions/${promotionId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ isActive: false })
      .expect(200);

    expect(res.body.isActive).toBe(false);
  });

  it('GET /api/promotions/active - deactivated promotion should NOT appear', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/promotions/active')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    const found = res.body.find((p: any) => p.id === promotionId);
    expect(found).toBeUndefined();
  });

  it('PUT /api/promotions/:id - reactivate for cleanup test', async () => {
    const res = await request(app.getHttpServer())
      .put(`/api/promotions/${promotionId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ isActive: true })
      .expect(200);

    expect(res.body.isActive).toBe(true);
  });

  it('DELETE /api/promotions/:id - should delete promotion', async () => {
    await request(app.getHttpServer())
      .delete(`/api/promotions/${promotionId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    // Verify gone
    await request(app.getHttpServer())
      .get(`/api/promotions/${promotionId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(404);
  });

  // ─── Validation ───

  it('POST /api/promotions - should reject invalid discountType', async () => {
    await request(app.getHttpServer())
      .post('/api/promotions')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Bad Promo',
        discountType: 'INVALID',
        discountValue: 10,
        startDate,
        endDate,
      })
      .expect(400);
  });

  it('POST /api/promotions - should create FIXED promotion', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/promotions')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: `E2E Fixed Promo ${ts}`,
        discountType: 'FIXED',
        discountValue: 5000,
        applicableTo: 'ALL',
        startDate,
        endDate,
      })
      .expect(201);

    expect(res.body.discountType).toBe('FIXED');
    expect(res.body.discountValue).toBe(5000);

    // Cleanup
    await request(app.getHttpServer())
      .delete(`/api/promotions/${res.body.id}`)
      .set('Authorization', `Bearer ${authToken}`);
  });
});
