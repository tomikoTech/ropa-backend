import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { setupTestApp, loginAsAdmin, teardownTestApp } from './helpers/setup';

describe('Clients (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let createdClientId: string;
  const uniqueSuffix = Date.now();

  beforeAll(async () => {
    app = await setupTestApp();
    token = await loginAsAdmin(app);
  }, 30000);

  afterAll(async () => {
    await teardownTestApp();
  });

  // ─── CREATE ───

  it('POST /api/clients → creates a client', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/clients')
      .set('Authorization', `Bearer ${token}`)
      .send({
        firstName: `E2E Client ${uniqueSuffix}`,
        lastName: 'TestLastName',
        documentNumber: `DOC-${uniqueSuffix}`,
        phone: '3001234567',
      })
      .expect(201);

    const client = res.body;
    expect(client).toBeDefined();
    expect(client.id).toBeDefined();
    expect(client.firstName).toBe(`E2E Client ${uniqueSuffix}`);
    expect(client.lastName).toBe('TestLastName');
    expect(client.documentNumber).toBe(`DOC-${uniqueSuffix}`);
    expect(client.phone).toBe('3001234567');

    createdClientId = client.id;
  });

  // ─── LIST ───

  it('GET /api/clients → returns array including created client', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/clients')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const clients = res.body;
    expect(Array.isArray(clients)).toBe(true);

    const found = clients.find((c: any) => c.id === createdClientId);
    expect(found).toBeDefined();
    expect(found.firstName).toBe(`E2E Client ${uniqueSuffix}`);
  });

  // ─── SEARCH ───

  it('GET /api/clients/search?q=... → finds client by name', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/clients/search?q=E2E Client ${uniqueSuffix}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const results = res.body;
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThanOrEqual(1);

    const found = results.find((c: any) => c.id === createdClientId);
    expect(found).toBeDefined();
  });

  // ─── UPDATE ───

  it('PATCH /api/clients/:id → updates client phone', async () => {
    const newPhone = '3109876543';
    const res = await request(app.getHttpServer())
      .patch(`/api/clients/${createdClientId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: newPhone })
      .expect(200);

    const updated = res.body;
    expect(updated.phone).toBe(newPhone);
    expect(updated.firstName).toBe(`E2E Client ${uniqueSuffix}`);
  });

  // ─── GENERIC CLIENT ───

  it('GET /api/clients/generic → returns the generic/default client', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/clients/generic')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const generic = res.body;
    expect(generic).toBeDefined();
    expect(generic.isGeneric).toBe(true);
  });

  // ─── VALIDATION ───

  it('POST /api/clients → rejects missing required fields', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/clients')
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '123' })
      .expect(400);

    expect(res.body.statusCode).toBe(400);
  });

  it('POST /api/clients → rejects duplicate documentNumber', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/clients')
      .set('Authorization', `Bearer ${token}`)
      .send({
        firstName: 'Duplicate',
        lastName: 'Test',
        documentNumber: `DOC-${uniqueSuffix}`,
      })
      .expect(409);

    expect(res.body.statusCode).toBe(409);
  });

  // ─── CLEANUP ───

  it('DELETE /api/clients/:id → removes the test client', async () => {
    await request(app.getHttpServer())
      .delete(`/api/clients/${createdClientId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    // Verify it's gone
    await request(app.getHttpServer())
      .get(`/api/clients/${createdClientId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });
});
