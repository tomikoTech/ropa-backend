import { INestApplication } from '@nestjs/common';
import request from 'supertest';

/**
 * Tries multiple known admin credentials (CI seed + local dev).
 * Returns the access token on success, throws on failure.
 */
export async function tryLogin(app: INestApplication): Promise<string> {
  const credentials = [
    { email: 'tuchapato@gmail.com', password: 'tuchapato123' },
    { email: 'admin@mipinta.co', password: 'admin123' },
  ];

  for (const cred of credentials) {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send(cred);
    if (res.status === 201) {
      return res.body.accessToken;
    }
  }

  throw new Error('Could not login with any known admin credentials');
}
