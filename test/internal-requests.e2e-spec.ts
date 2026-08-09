import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { tryLogin } from './helpers/login';

describe('Solicitudes internas SO- (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let sourceId: string;
  let destinationId: string;
  let variantId: string;
  const ts = Date.now();
  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    token = await tryLogin(app);
    const [source, destination] = await Promise.all([
      request(app.getHttpServer())
        .post('/api/inventory/warehouses')
        .set(auth())
        .send({ name: `SO origen ${ts}`, code: `SOO-${String(ts).slice(-5)}` }),
      request(app.getHttpServer())
        .post('/api/inventory/warehouses')
        .set(auth())
        .send({
          name: `SO destino ${ts}`,
          code: `SOD-${String(ts).slice(-5)}`,
        }),
    ]);
    sourceId = source.body.id;
    destinationId = destination.body.id;
    const product = await request(app.getHttpServer())
      .post('/api/products')
      .set(auth())
      .send({
        name: `SO producto ${ts}`,
        basePrice: 80000,
        costPrice: 40000,
        variants: [{ size: '40', color: 'Negro' }],
      });
    variantId = product.body.variants[0].id;
    await request(app.getHttpServer())
      .post('/api/inventory/adjust')
      .set(auth())
      .send({
        variantId,
        warehouseId: sourceId,
        quantity: 10,
        movementType: 'IN',
        notes: 'SO stock',
      })
      .expect(201);
  }, 90000);

  afterAll(async () => app.close());

  it('crea, prepara concurrentemente, remite parcial y recibe sin redigitar', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/internal-requests')
      .set(auth())
      .send({
        destinationWarehouseId: destinationId,
        items: [{ variantId, quantity: 6 }],
        notes: 'Reposición punto',
      })
      .expect(201);
    expect(created.body.requestNumber).toMatch(/^SO-\d{5}$/);
    expect(created.body.items[0].variant.size).toBe('40');
    const id = created.body.id as string;
    const itemId = created.body.items[0].id as string;

    const [a, b] = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/internal-requests/${id}/prepare`)
        .set(auth())
        .send({
          sourceWarehouseId: sourceId,
          items: [{ itemId, quantity: 3 }],
        }),
      request(app.getHttpServer())
        .post(`/api/internal-requests/${id}/prepare`)
        .set(auth())
        .send({
          sourceWarehouseId: sourceId,
          items: [{ itemId, quantity: 3 }],
        }),
    ]);
    expect([a.status, b.status]).toEqual([201, 201]);
    expect(
      Math.max(
        a.body.items[0].preparedQuantity,
        b.body.items[0].preparedQuantity,
      ),
    ).toBe(6);

    await request(app.getHttpServer())
      .post(`/api/internal-requests/${id}/print`)
      .set(auth())
      .send({})
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/internal-requests/${id}/print`)
      .set(auth())
      .send({})
      .expect(400);
    const reprint = await request(app.getHttpServer())
      .post(`/api/internal-requests/${id}/print`)
      .set(auth())
      .send({ reprint: true })
      .expect(201);
    expect(reprint.body.reprint).toBe(true);

    const partial = await request(app.getHttpServer())
      .post(`/api/internal-requests/${id}/remit`)
      .set(auth())
      .send({ items: [{ itemId, quantity: 4 }] })
      .expect(201);
    expect(partial.body.status).toBe('PREPARED');
    expect(partial.body.shipments).toHaveLength(1);
    await request(app.getHttpServer())
      .post(`/api/internal-requests/${id}/receive`)
      .set(auth())
      .send({})
      .expect(201);

    const completed = await request(app.getHttpServer())
      .post(`/api/internal-requests/${id}/remit`)
      .set(auth())
      .send({ items: [{ itemId, quantity: 2 }] })
      .expect(201);
    expect(completed.body.status).toBe('REMITTED');
    await request(app.getHttpServer())
      .post(`/api/internal-requests/${id}/receive`)
      .set(auth())
      .send({})
      .expect(201);

    const stock = await request(app.getHttpServer())
      .get('/api/inventory/stock')
      .set(auth())
      .expect(200);
    const rows = stock.body.items ?? stock.body;
    expect(
      rows.find(
        (row: { variantId: string; warehouseId: string }) =>
          row.variantId === variantId && row.warehouseId === sourceId,
      ).quantity,
    ).toBe(4);
    expect(
      rows.find(
        (row: { variantId: string; warehouseId: string }) =>
          row.variantId === variantId && row.warehouseId === destinationId,
      ).quantity,
    ).toBe(6);
    await request(app.getHttpServer())
      .post(`/api/internal-requests/${id}/cancel`)
      .set(auth())
      .send({})
      .expect(400);
  }, 30000);

  it('rechaza stock insuficiente y permite cancelar antes de remitir', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/internal-requests')
      .set(auth())
      .send({
        destinationWarehouseId: destinationId,
        items: [{ variantId, quantity: 99 }],
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/internal-requests/${created.body.id}/prepare`)
      .set(auth())
      .send({
        sourceWarehouseId: sourceId,
        items: [{ itemId: created.body.items[0].id, quantity: 99 }],
      })
      .expect(400);
    const cancelled = await request(app.getHttpServer())
      .post(`/api/internal-requests/${created.body.id}/cancel`)
      .set(auth())
      .send({})
      .expect(201);
    expect(cancelled.body.status).toBe('CANCELLED');
  });

  it('devuelve una solicitud que todavía está en tránsito', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/internal-requests')
      .set(auth())
      .send({
        destinationWarehouseId: destinationId,
        items: [{ variantId, quantity: 1 }],
      })
      .expect(201);
    const itemId = created.body.items[0].id;
    await request(app.getHttpServer())
      .post(`/api/internal-requests/${created.body.id}/prepare`)
      .set(auth())
      .send({
        sourceWarehouseId: sourceId,
        items: [{ itemId, quantity: 1 }],
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/internal-requests/${created.body.id}/remit`)
      .set(auth())
      .send({ items: [{ itemId, quantity: 1 }] })
      .expect(201);
    const returned = await request(app.getHttpServer())
      .post(`/api/internal-requests/${created.body.id}/return`)
      .set(auth())
      .send({})
      .expect(201);
    expect(returned.body.status).toBe('RETURNED');
  });
});
