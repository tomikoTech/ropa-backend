import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { setupTestApp, loginAsAdmin, teardownTestApp } from './helpers/setup';

describe('Categories (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let categoryId1: string;
  let categoryId2: string;
  const uniqueSuffix = Date.now();

  beforeAll(async () => {
    app = await setupTestApp();
    token = await loginAsAdmin(app);
  }, 30000);

  afterAll(async () => {
    await teardownTestApp();
  });

  describe('POST /api/categories', () => {
    it('should create the first category', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/categories')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: `Cat A ${uniqueSuffix}`,
          description: 'First test category',
          sortOrder: 10,
        })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.name).toBe(`Cat A ${uniqueSuffix}`);
      categoryId1 = res.body.id;
    });

    it('should create a second category', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/categories')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: `Cat B ${uniqueSuffix}`,
          description: 'Second test category',
          sortOrder: 20,
        })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      categoryId2 = res.body.id;
    });

    it('should reject category without name', async () => {
      await request(app.getHttpServer())
        .post('/api/categories')
        .set('Authorization', `Bearer ${token}`)
        .send({ description: 'No name provided' })
        .expect(400);
    });
  });

  describe('GET /api/categories', () => {
    it('should return an array of categories', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/categories')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toBeInstanceOf(Array);
      expect(res.body.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('PATCH /api/categories/:id', () => {
    it('should update category name', async () => {
      const updatedName = `Cat A Updated ${uniqueSuffix}`;

      const res = await request(app.getHttpServer())
        .patch(`/api/categories/${categoryId1}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: updatedName })
        .expect(200);

      expect(res.body.name).toBe(updatedName);
    });
  });

  describe('PATCH /api/categories/reorder', () => {
    it('should reorder categories', async () => {
      await request(app.getHttpServer())
        .patch('/api/categories/reorder')
        .set('Authorization', `Bearer ${token}`)
        .send({ orderedIds: [categoryId2, categoryId1] })
        .expect(200);

      // Verify the new order by fetching categories
      const listRes = await request(app.getHttpServer())
        .get('/api/categories')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const cat2 = listRes.body.find((c: any) => c.id === categoryId2);
      const cat1 = listRes.body.find((c: any) => c.id === categoryId1);
      expect(cat2.sortOrder).toBeLessThan(cat1.sortOrder);
    });
  });

  describe('DELETE /api/categories/:id', () => {
    it('should delete the first category', async () => {
      await request(app.getHttpServer())
        .delete(`/api/categories/${categoryId1}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });

    it('should delete the second category', async () => {
      await request(app.getHttpServer())
        .delete(`/api/categories/${categoryId2}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });

    it('should return 404 for deleted category', async () => {
      await request(app.getHttpServer())
        .get(`/api/categories/${categoryId1}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });
});
