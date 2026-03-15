import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { setupTestApp, loginAsAdmin, teardownTestApp } from './helpers/setup';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    app = await setupTestApp();
  }, 30000);

  afterAll(async () => {
    await teardownTestApp();
  });

  describe('POST /api/auth/login', () => {
    it('should return tokens and user with valid credentials', async () => {
      // Try CI or local credentials
      const creds = [
        { email: 'tuchapato@gmail.com', password: 'tuchapato123' },
        { email: 'admin@mipinta.co', password: 'admin123' },
      ];
      let res: any;
      for (const cred of creds) {
        res = await request(app.getHttpServer())
          .post('/api/auth/login')
          .send(cred);
        if (res.status === 201) break;
      }

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
      expect(res.body).toHaveProperty('user');

      token = res.body.accessToken;
    });

    it('should return 401 with wrong password', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'nobody@test.com', password: 'wrongpassword' })
        .expect(401);

      expect(res.body.statusCode).toBe(401);
      expect(res.body.message).toBeDefined();
    });

    it('should return 401 with non-existent email', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'nobody@mipinta.co', password: 'tuchapato123' })
        .expect(401);

      expect(res.body.statusCode).toBe(401);
    });
  });

  describe('GET /api/auth/profile', () => {
    it('should return user profile with valid token', async () => {
      if (!token) {
        token = await loginAsAdmin(app);
      }

      const res = await request(app.getHttpServer())
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('email');
    });

    it('should return 401 without token', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/auth/profile')
        .expect(401);

      expect(res.body.statusCode).toBe(401);
    });

    it('should return 401 with invalid token', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/auth/profile')
        .set('Authorization', 'Bearer invalid-token-here')
        .expect(401);

      expect(res.body.statusCode).toBe(401);
    });
  });
});
