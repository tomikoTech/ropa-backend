import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { setupTestApp, loginAsAdmin, teardownTestApp } from './helpers/setup';

describe('Products (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let createdProductId: string;
  const uniqueName = `Test Product ${Date.now()}`;

  beforeAll(async () => {
    app = await setupTestApp();
    token = await loginAsAdmin(app);
  }, 30000);

  afterAll(async () => {
    // Clean up created product if it still exists
    if (createdProductId) {
      await request(app.getHttpServer())
        .delete(`/api/products/${createdProductId}`)
        .set('Authorization', `Bearer ${token}`);
    }
    await teardownTestApp();
  });

  describe('GET /api/products', () => {
    it('should return an array of products', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/products')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.data).toBeInstanceOf(Array);
    });
  });

  describe('POST /api/products', () => {
    it('should create a product with variants', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/products')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: uniqueName,
          basePrice: 49900,
          taxRate: 19,
          gender: 'UNISEX',
          variants: [
            { size: 'M', color: 'Negro' },
            { size: 'L', color: 'Blanco' },
          ],
        })
        .expect(201);

      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data.name).toBe(uniqueName);
      expect(Number(res.body.data.basePrice)).toBe(49900);
      expect(res.body.data.variants).toHaveLength(2);

      createdProductId = res.body.data.id;
    });

    it('should reject product without required fields', async () => {
      await request(app.getHttpServer())
        .post('/api/products')
        .set('Authorization', `Bearer ${token}`)
        .send({ description: 'Missing name and price' })
        .expect(400);
    });
  });

  describe('GET /api/products/:id', () => {
    it('should return the created product by ID', async () => {
      expect(createdProductId).toBeDefined();

      const res = await request(app.getHttpServer())
        .get(`/api/products/${createdProductId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.data.id).toBe(createdProductId);
      expect(res.body.data.name).toBe(uniqueName);
      expect(res.body.data.variants).toBeInstanceOf(Array);
    });
  });

  describe('PATCH /api/products/:id', () => {
    it('should update product name and basePrice', async () => {
      expect(createdProductId).toBeDefined();
      const updatedName = `${uniqueName} Updated`;

      const res = await request(app.getHttpServer())
        .patch(`/api/products/${createdProductId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: updatedName, basePrice: 59900 })
        .expect(200);

      expect(res.body.data.name).toBe(updatedName);
      expect(Number(res.body.data.basePrice)).toBe(59900);
    });
  });

  describe('GET /api/products/search', () => {
    it('should find products matching the search query', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/products/search')
        .query({ q: 'Test Product' })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.data).toBeInstanceOf(Array);
    });
  });

  describe('PATCH /api/products/:id/publish', () => {
    it('should publish the product', async () => {
      expect(createdProductId).toBeDefined();

      const res = await request(app.getHttpServer())
        .patch(`/api/products/${createdProductId}/publish`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.data.isPublished).toBe(true);
      expect(res.body.data.publishedAt).toBeDefined();
    });
  });

  describe('PATCH /api/products/:id/unpublish', () => {
    it('should unpublish the product', async () => {
      expect(createdProductId).toBeDefined();

      const res = await request(app.getHttpServer())
        .patch(`/api/products/${createdProductId}/unpublish`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.data.isPublished).toBe(false);
    });
  });

  describe('DELETE /api/products/:id', () => {
    it('should delete the product', async () => {
      expect(createdProductId).toBeDefined();

      await request(app.getHttpServer())
        .delete(`/api/products/${createdProductId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // Verify it's gone
      await request(app.getHttpServer())
        .get(`/api/products/${createdProductId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);

      // Prevent afterAll from trying to delete again
      createdProductId = undefined!;
    });
  });
});
