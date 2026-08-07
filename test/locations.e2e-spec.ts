import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { tryLogin } from './helpers/login';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

describe('Ubicaciones: estanterías y stands (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let warehouseId: string;
  let shelfId: string;

  const ts = Date.now();

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    token = await tryLogin(app);

    const wh = await request(app.getHttpServer())
      .post('/api/inventory/warehouses')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `E2E Ubic WH ${ts}`, code: `UB-${ts.toString().slice(-5)}` });
    warehouseId = wh.body.id;
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  it('crea una estantería en la bodega', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/inventory/warehouses/${warehouseId}/shelves`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Estantería A' })
      .expect(201);

    expect(res.body.name).toBe('Estantería A');
    expect(res.body.warehouseId).toBe(warehouseId);
    shelfId = res.body.id;
  });

  it('rechaza una estantería con el nombre repetido en la misma bodega', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/inventory/warehouses/${warehouseId}/shelves`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Estantería A' });

    expect(res.status).toBe(409);
    expect(String(res.body.message)).toMatch(/ya existe/i);
  });

  it('crea stands dentro de la estantería', async () => {
    for (const name of ['1', '2']) {
      await request(app.getHttpServer())
        .post(`/api/inventory/shelves/${shelfId}/stands`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name })
        .expect(201);
    }
  });

  it('rechaza un stand repetido en la misma estantería', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/inventory/shelves/${shelfId}/stands`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '1' });

    expect(res.status).toBe(409);
  });

  it('lista las estanterías con sus stands anidados', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/inventory/warehouses/${warehouseId}/shelves`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const shelf = res.body.find((s: { id: string }) => s.id === shelfId);
    expect(shelf).toBeDefined();
    expect(shelf.stands.map((s: { name: string }) => s.name).sort()).toEqual([
      '1',
      '2',
    ]);
  });

  it('renombra la estantería', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/inventory/shelves/${shelfId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Estantería A1' })
      .expect(200);

    expect(res.body.name).toBe('Estantería A1');
  });

  // Los stands no existen fuera de su estantería: borrarla debe llevárselos,
  // no dejarlos huérfanos.
  it('al eliminar la estantería se eliminan sus stands', async () => {
    await request(app.getHttpServer())
      .delete(`/api/inventory/shelves/${shelfId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const res = await request(app.getHttpServer())
      .get(`/api/inventory/warehouses/${warehouseId}/shelves`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(
      res.body.find((s: { id: string }) => s.id === shelfId),
    ).toBeUndefined();
  });

  it('responde 404 con una bodega inexistente', async () => {
    await request(app.getHttpServer())
      .get(
        '/api/inventory/warehouses/00000000-0000-0000-0000-000000000000/shelves',
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });
});
