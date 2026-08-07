import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { tryLogin } from './helpers/login';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

describe('Curvas de tallas (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let typeId: string;
  let curveId: string;
  const sizeIds: string[] = [];

  const ts = Date.now();
  const auth = () => ({ Authorization: `Bearer ${token}` });

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

    // Tallas propias de la prueba, para no depender del catálogo existente.
    for (const name of [`C36-${ts}`, `C37-${ts}`, `C38-${ts}`]) {
      const res = await request(app.getHttpServer())
        .post('/api/sizes')
        .set(auth())
        .send({ name });
      sizeIds.push(res.body.id);
    }
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  it('crea una familia de curvas', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/size-curves/types')
      .set(auth())
      .send({ name: `DAMA ${ts}` })
      .expect(201);

    expect(res.body.name).toBe(`DAMA ${ts}`);
    typeId = res.body.id;
  });

  it('crea una curva y calcula el total de unidades por caja', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/size-curves')
      .set(auth())
      .send({
        name: `Curva 6-6-6 ${ts}`,
        curveTypeId: typeId,
        items: [
          { sizeId: sizeIds[0], quantity: 6 },
          { sizeId: sizeIds[1], quantity: 6 },
          { sizeId: sizeIds[2], quantity: 6 },
        ],
      })
      .expect(201);

    // Es el dato que define cuántos pares trae la caja.
    expect(res.body.totalUnits).toBe(18);
    expect(res.body.items).toHaveLength(3);
    curveId = res.body.id;
  });

  it('devuelve los renglones en orden natural de talla', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/size-curves/${curveId}`)
      .set(auth())
      .expect(200);

    const names = res.body.items.map((i: { size: { name: string } }) => i.size.name);
    expect(names).toEqual([`C36-${ts}`, `C37-${ts}`, `C38-${ts}`]);
  });

  it('rechaza una curva que repite la misma talla', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/size-curves')
      .set(auth())
      .send({
        name: `Curva repetida ${ts}`,
        items: [
          { sizeId: sizeIds[0], quantity: 6 },
          { sizeId: sizeIds[0], quantity: 3 },
        ],
      });

    expect(res.status).toBe(400);
    expect(String(res.body.message)).toMatch(/repetir/i);
  });

  // Aislamiento multi-tenant: no debe poder armarse una curva con la talla
  // de otra tienda pasando su id.
  it('rechaza una curva con una talla que no existe en el catálogo', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/size-curves')
      .set(auth())
      .send({
        name: `Curva ajena ${ts}`,
        items: [
          { sizeId: '00000000-0000-0000-0000-000000000000', quantity: 6 },
        ],
      });

    expect(res.status).toBe(400);
    expect(String(res.body.message)).toMatch(/no existen en el catálogo/i);
  });

  it('rechaza el nombre de curva duplicado', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/size-curves')
      .set(auth())
      .send({
        name: `Curva 6-6-6 ${ts}`,
        items: [{ sizeId: sizeIds[0], quantity: 1 }],
      });

    expect(res.status).toBe(409);
  });

  it('al editar reemplaza el detalle y recalcula el total', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/size-curves/${curveId}`)
      .set(auth())
      .send({
        items: [
          { sizeId: sizeIds[0], quantity: 10 },
          { sizeId: sizeIds[1], quantity: 2 },
        ],
      })
      .expect(200);

    expect(res.body.totalUnits).toBe(12);
    expect(res.body.items).toHaveLength(2);
  });

  it('duplica una curva con otro nombre conservando el surtido', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/size-curves/${curveId}/duplicate`)
      .set(auth())
      .send({ name: `Curva copia ${ts}` })
      .expect(201);

    expect(res.body.id).not.toBe(curveId);
    expect(res.body.totalUnits).toBe(12);
  });

  // La talla está referenciada por la curva (FK RESTRICT): debe avisar,
  // no reventar contra la base de datos.
  it('no deja eliminar una talla usada por una curva', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/sizes/${sizeIds[0]}`)
      .set(auth());

    expect(res.status).toBe(409);
    expect(String(res.body.message)).toMatch(/curva/i);
  });

  it('eliminar la familia deja las curvas sin familia, no las borra', async () => {
    await request(app.getHttpServer())
      .delete(`/api/size-curves/types/${typeId}`)
      .set(auth())
      .expect(200);

    const res = await request(app.getHttpServer())
      .get(`/api/size-curves/${curveId}`)
      .set(auth())
      .expect(200);

    expect(res.body.curveTypeId).toBeNull();
  });

  it('elimina la curva y sus renglones', async () => {
    await request(app.getHttpServer())
      .delete(`/api/size-curves/${curveId}`)
      .set(auth())
      .expect(200);

    await request(app.getHttpServer())
      .get(`/api/size-curves/${curveId}`)
      .set(auth())
      .expect(404);
  });
});
