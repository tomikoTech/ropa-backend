import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { tryLogin } from './helpers/login';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { DataSource } from 'typeorm';
import {
  StockUnit,
  StockUnitKind,
  StockUnitStatus,
} from '../src/inventory/entities/stock-unit.entity';
import { ProductVariant } from '../src/products/entities/product-variant.entity';
import { StockUnitContent } from '../src/inventory/entities/stock-unit-content.entity';

describe('Conteo físico de inventario (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let warehouseId: string;
  let variantId: string;
  let countId: string;
  let countNumber: string;
  let dataSource: DataSource;

  const ts = Date.now();
  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    dataSource = app.get(DataSource);

    token = await tryLogin(app);

    const wh = await request(app.getHttpServer())
      .post('/api/inventory/warehouses')
      .set(auth())
      .send({
        name: `E2E Conteo WH ${ts}`,
        code: `CT-${ts.toString().slice(-5)}`,
      });
    warehouseId = wh.body.id;

    const prod = await request(app.getHttpServer())
      .post('/api/products')
      .set(auth())
      .send({
        name: `E2E Conteo Producto ${ts}`,
        basePrice: 10000,
        costPrice: 5000,
        variants: [{ size: 'U', color: 'Negro' }],
      });
    variantId = prod.body.variants[0].id;

    // El sistema queda con 10 unidades.
    await request(app.getHttpServer())
      .post('/api/inventory/adjust')
      .set(auth())
      .send({
        variantId,
        warehouseId,
        quantity: 10,
        movementType: 'IN',
        notes: 'stock inicial conteo',
      });
  }, 90000);

  afterAll(async () => {
    await app.close();
  });

  it('abre un conteo con su consecutivo', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/inventory-counts')
      .set(auth())
      .send({ warehouseId, notes: 'Conteo E2E' })
      .expect(201);

    expect(res.body.countNumber).toMatch(/^INV-\d{5}$/);
    expect(res.body.status).toBe('OPEN');
    countId = res.body.id;
    countNumber = res.body.countNumber;
  });

  // Dos conteos abiertos a la vez sobre la misma bodega darían resultados
  // contradictorios al cerrarlos.
  it('no deja abrir dos conteos en la misma bodega', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/inventory-counts')
      .set(auth())
      .send({ warehouseId });

    expect(res.status).toBe(400);
    expect(String(res.body.message)).toMatch(/ya hay un conteo abierto/i);
  });

  // Se cuenta pasando el lector por la mercancía, no tecleando totales.
  it('acumula lo contado escaneo a escaneo', async () => {
    for (let i = 0; i < 3; i++) {
      await request(app.getHttpServer())
        .post(`/api/inventory-counts/${countId}/lines`)
        .set(auth())
        .send({ variantId })
        .expect(201);
    }
    const res = await request(app.getHttpServer())
      .post(`/api/inventory-counts/${countId}/lines`)
      .set(auth())
      .send({ variantId, quantity: 4 })
      .expect(201);

    expect(res.body.countedQuantity).toBe(7);
  });

  it('reporta la diferencia contra el sistema', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/inventory-counts/${countId}/differences`)
      .set(auth())
      .expect(200);

    const d = res.body.find(
      (x: { variantId: string }) => x.variantId === variantId,
    );
    expect(d.expected).toBe(10);
    expect(d.counted).toBe(7);
    // Negativo = faltante: es justo lo que un conteo debe sacar a la luz.
    expect(d.difference).toBe(-3);
  });

  it('al cerrar con ajuste deja el inventario igual a lo contado', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/inventory-counts/${countId}/close`)
      .set(auth())
      .send({ adjust: true, confirmation: countNumber })
      .expect(201);

    expect(res.body.adjusted).toBeGreaterThanOrEqual(1);

    const stock = await request(app.getHttpServer())
      .get('/api/inventory/stock')
      .set(auth())
      .expect(200);

    const fila = (stock.body.items ?? stock.body).find(
      (s: { variantId: string; warehouseId: string }) =>
        s.variantId === variantId && s.warehouseId === warehouseId,
    );
    expect(fila.quantity).toBe(7);
  });

  it('un conteo cerrado ya no admite más escaneos', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/inventory-counts/${countId}/lines`)
      .set(auth())
      .send({ variantId });

    expect(res.status).toBe(400);
    expect(String(res.body.message)).toMatch(/ya está cerrado/i);
  });

  it('tras cerrar, se puede abrir uno nuevo en la misma bodega', async () => {
    await request(app.getHttpServer())
      .post('/api/inventory-counts')
      .set(auth())
      .send({ warehouseId })
      .expect(201);
  });

  it('cuenta códigos físicos con dos escáneres, reintentos y cierre auditable', async () => {
    const wh = await request(app.getHttpServer())
      .post('/api/inventory/warehouses')
      .set(auth())
      .send({
        name: `E2E Conteo físico ${ts}`,
        code: `CF-${ts.toString().slice(-5)}`,
      })
      .expect(201);

    const variant = await dataSource
      .getRepository(ProductVariant)
      .findOneOrFail({
        where: { id: variantId },
        relations: { product: true },
      });
    const physicalBarcodes = [`E2E-${ts}-01`, `E2E-${ts}-02`, `E2E-${ts}-CAJA`];
    const unitRepo = dataSource.getRepository(StockUnit);
    const units = await unitRepo.save(
      physicalBarcodes.slice(0, 2).map((barcode) =>
        unitRepo.create({
          barcode,
          kind: StockUnitKind.UNIT,
          status: StockUnitStatus.IN_STOCK,
          productId: variant.productId,
          colorId: variant.colorId,
          sizeId: variant.sizeId,
          variantId,
          warehouseId: wh.body.id,
          standId: null,
          quantity: 1,
          cost: 5000,
          purchaseBoxLineId: null,
          parentUnitId: null,
          printedAt: null,
          tenantId: variant.tenantId,
        }),
      ),
    );
    const box = await unitRepo.save(
      unitRepo.create({
        barcode: physicalBarcodes[2],
        kind: StockUnitKind.BOX,
        status: StockUnitStatus.IN_STOCK,
        productId: variant.productId,
        colorId: variant.colorId,
        sizeId: null,
        variantId,
        warehouseId: wh.body.id,
        standId: null,
        quantity: 2,
        cost: 5000,
        purchaseBoxLineId: null,
        parentUnitId: null,
        printedAt: null,
        tenantId: variant.tenantId,
      }),
    );
    const contentRepo = dataSource.getRepository(StockUnitContent);
    await contentRepo.save(
      contentRepo.create({
        boxUnitId: box.id,
        sizeId: variant.sizeId!,
        variantId,
        expectedQuantity: 2,
        actualQuantity: 2,
        tenantId: variant.tenantId,
      }),
    );
    await request(app.getHttpServer())
      .post('/api/inventory/adjust')
      .set(auth())
      .send({
        variantId,
        warehouseId: wh.body.id,
        quantity: 4,
        movementType: 'IN',
        notes: 'stock físico conteo concurrente',
      })
      .expect(201);

    const opened = await request(app.getHttpServer())
      .post('/api/inventory-counts')
      .set(auth())
      .send({ warehouseId: wh.body.id })
      .expect(201);
    const physicalCountId = opened.body.id as string;
    const physicalCountNumber = opened.body.countNumber as string;

    const [scanA, scanB] = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/inventory-counts/${physicalCountId}/scan`)
        .set(auth())
        .send({
          barcode: physicalBarcodes[0],
          clientScanId: `device-a-${ts}`,
          deviceId: 'pistola-a',
        }),
      request(app.getHttpServer())
        .post(`/api/inventory-counts/${physicalCountId}/scan`)
        .set(auth())
        .send({
          barcode: physicalBarcodes[0],
          clientScanId: `device-b-${ts}`,
          deviceId: 'celular-b',
        }),
    ]);
    expect([scanA.status, scanB.status]).toEqual([201, 201]);
    expect([scanA.body.result, scanB.body.result].sort()).toEqual([
      'COUNTED',
      'DUPLICATE',
    ]);

    const boxScan = await request(app.getHttpServer())
      .post(`/api/inventory-counts/${physicalCountId}/scan`)
      .set(auth())
      .send({
        barcode: physicalBarcodes[2],
        clientScanId: `box-${ts}`,
        deviceId: 'pistola-a',
      })
      .expect(201);
    expect(boxScan.body.result).toBe('COUNTED');
    expect(boxScan.body.quantity).toBe(2);

    // Reenviar la misma lectura offline devuelve la respuesta original.
    const retry = await request(app.getHttpServer())
      .post(`/api/inventory-counts/${physicalCountId}/scan`)
      .set(auth())
      .send({
        barcode: physicalBarcodes[0],
        clientScanId: `device-a-${ts}`,
        deviceId: 'pistola-a',
      })
      .expect(201);
    expect(retry.body.result).toBe('COUNTED');

    await request(app.getHttpServer())
      .post(`/api/inventory-counts/${physicalCountId}/scan`)
      .set(auth())
      .send({
        barcode: `DESCONOCIDO-${ts}`,
        clientScanId: `unknown-${ts}`,
        deviceId: 'celular-b',
      })
      .expect(201);

    const session = await request(app.getHttpServer())
      .get(`/api/inventory-counts/${physicalCountId}/session`)
      .set(auth())
      .expect(200);
    expect(session.body.summary.expectedCodes).toBe(3);
    expect(session.body.summary.countedCodes).toBe(2);
    expect(session.body.summary.countedQuantity).toBe(3);
    expect(session.body.summary.missingCodes).toBe(1);
    expect(session.body.summary.exceptions).toBe(2); // duplicado + desconocido

    await request(app.getHttpServer())
      .post(`/api/inventory-counts/${physicalCountId}/close`)
      .set(auth())
      .send({ adjust: true, confirmation: physicalCountNumber })
      .expect(400);

    const closed = await request(app.getHttpServer())
      .post(`/api/inventory-counts/${physicalCountId}/close`)
      .set(auth())
      .send({
        adjust: true,
        confirmation: physicalCountNumber,
        acknowledgeExceptions: true,
      })
      .expect(201);
    expect(closed.body.writtenOffCodes).toBe(1);

    const missingUnit = await unitRepo.findOneByOrFail({ id: units[1].id });
    expect(missingUnit.status).toBe(StockUnitStatus.WRITTEN_OFF);
  }, 30000);
});
