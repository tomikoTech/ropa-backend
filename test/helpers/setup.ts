/**
 * Force local/CI database for E2E tests.
 * In CI, DB_* env vars are set by the workflow → use them as-is.
 * Locally, fallback to dev defaults (dylanbc1, no password, ropa_pos).
 * MUST run before any NestJS module is imported/compiled.
 */
if (!process.env.E2E_USE_CLOUD_DB) {
  // Only override if not already set by CI
  if (!process.env.DB_HOST) process.env.DB_HOST = 'localhost';
  if (!process.env.DB_PORT) process.env.DB_PORT = '5432';
  if (!process.env.DB_USERNAME) process.env.DB_USERNAME = 'dylanbc1';
  if (!process.env.DB_PASSWORD) process.env.DB_PASSWORD = '';
  if (!process.env.DB_DATABASE) process.env.DB_DATABASE = 'ropa_pos';
  if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'test-secret';
  if (!process.env.JWT_REFRESH_SECRET)
    process.env.JWT_REFRESH_SECRET = 'test-refresh';
}

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module';

let app: INestApplication;
let accessToken: string;

/**
 * Creates and configures the NestJS app for E2E testing.
 * Minimal setup: prefix + validation only (no filter/interceptor)
 * so response shape matches raw controller output.
 */
export async function setupTestApp(): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  app = moduleFixture.createNestApplication();

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  await app.init();
  return app;
}

/**
 * Logs in as admin and returns the JWT access token.
 */
export async function loginAsAdmin(
  application: INestApplication,
): Promise<string> {
  // Try CI seed credentials first, then local dev credentials
  const credentials = [
    { email: 'tuchapato@gmail.com', password: 'tuchapato123' },
    { email: 'admin@mipinta.co', password: 'admin123' },
  ];

  for (const cred of credentials) {
    const res = await request(application.getHttpServer())
      .post('/api/auth/login')
      .send(cred);
    if (res.status === 201) {
      accessToken = res.body.accessToken;
      return accessToken;
    }
  }

  throw new Error('Could not login with any known admin credentials');
}

/**
 * Returns the cached access token (call loginAsAdmin first).
 */
export function getAccessToken(): string {
  return accessToken;
}

/**
 * Returns the app instance.
 */
export function getApp(): INestApplication {
  return app;
}

/**
 * Closes the app gracefully.
 */
export async function teardownTestApp(): Promise<void> {
  if (app) {
    await app.close();
  }
}
