import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { setupTestApp, loginAsAdmin, teardownTestApp } from './helpers/setup';

describe('Inventory (e2e)', () => {
  let app: INestApplication;
  let token: string;

  let warehouseId1: string;
  let warehouseId2: string;
  let productId: string;
  let variantId: string;
  const uniqueSuffix = Date.now();

  beforeAll(async () => {
    app = await setupTestApp();
    token = await loginAsAdmin(app);

    // Create a product with a variant to use for inventory tests
    const productRes = await request(app.getHttpServer())
      .post('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `Inv Test Product ${uniqueSuffix}`,
        basePrice: 30000,
        variants: [{ size: 'M', color: 'Rojo' }],
      });

    productId = productRes.body.id;
    variantId = productRes.body.variants[0].id;
  }, 30000);

  afterAll(async () => {
    // Clean up: delete the test product
    if (productId) {
      await request(app.getHttpServer())
        .delete(`/api/products/${productId}`)
        .set('Authorization', `Bearer ${token}`);
    }
    await teardownTestApp();
  });

  describe('POST /api/inventory/warehouses', () => {
    it('should create a warehouse without code (auto-generated)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/inventory/warehouses')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: `Bodega Auto ${uniqueSuffix}`,
          address: 'Calle 1 #2-3',
        })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.name).toBe(`Bodega Auto ${uniqueSuffix}`);
      expect(res.body).toHaveProperty('code');
      expect(res.body.code).toBeTruthy();

      warehouseId1 = res.body.id;
    });

    it('should create a second warehouse with explicit code', async () => {
      const code = `WH-${uniqueSuffix}`;

      const res = await request(app.getHttpServer())
        .post('/api/inventory/warehouses')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: `Bodega Manual ${uniqueSuffix}`,
          code,
          address: 'Calle 4 #5-6',
        })
        .expect(201);

      expect(res.body.code).toBe(code);
      warehouseId2 = res.body.id;
    });
  });

  describe('GET /api/inventory/warehouses', () => {
    it('should return both warehouses', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/inventory/warehouses')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toBeInstanceOf(Array);

      const ids = res.body.map((w: any) => w.id);
      expect(ids).toContain(warehouseId1);
      expect(ids).toContain(warehouseId2);
    });
  });

  describe('GET /api/inventory/stock (initial)', () => {
    it('should return stock array (may be empty for new variants)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/inventory/stock')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toBeInstanceOf(Array);
    });
  });

  describe('POST /api/inventory/adjust', () => {
    it('should adjust stock IN for variant in warehouse 1', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/inventory/adjust')
        .set('Authorization', `Bearer ${token}`)
        .send({
          variantId,
          warehouseId: warehouseId1,
          quantity: 20,
          movementType: 'IN',
          notes: 'Initial stock warehouse 1',
        })
        .expect(201);

      expect(res.body).toBeDefined();
    });

    it('should adjust stock IN for variant in warehouse 2', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/inventory/adjust')
        .set('Authorization', `Bearer ${token}`)
        .send({
          variantId,
          warehouseId: warehouseId2,
          quantity: 10,
          movementType: 'IN',
          notes: 'Initial stock warehouse 2',
        })
        .expect(201);

      expect(res.body).toBeDefined();
    });
  });

  describe('GET /api/inventory/stock (after adjustments)', () => {
    it('should have stock entries for the variant', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/inventory/stock')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const entries = res.body.filter(
        (s: any) => s.variantId === variantId || s.variant?.id === variantId,
      );
      expect(entries.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('POST /api/inventory/transfer', () => {
    it('should transfer stock from warehouse 1 to warehouse 2', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/inventory/transfer')
        .set('Authorization', `Bearer ${token}`)
        .send({
          variantId,
          fromWarehouseId: warehouseId1,
          toWarehouseId: warehouseId2,
          quantity: 5,
          notes: 'Transfer test',
          // Explícito a propósito: este test comprueba el traslado INMEDIATO
          // (20-5=15 y 10+5=15). Sin decirlo, el resultado dependía del ajuste
          // `transferConfirmationEnabled` de la tienda, que la suite de
          // traslados enciende para uno de sus casos: cuando las dos corrían a
          // la vez, el traslado quedaba en tránsito, el stock no llegaba al
          // destino y las bodegas no se podían borrar (la remisión pendiente las
          // referencia). Era la causa de los tres fallos intermitentes.
          requireConfirmation: false,
        })
        .expect(201);

      expect(res.body).toBeDefined();
    });
  });

  describe('GET /api/inventory/stock (after transfer)', () => {
    it('should reflect updated quantities after transfer', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/inventory/stock/variant/${variantId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const stockByWarehouse = res.body;
      expect(stockByWarehouse).toBeInstanceOf(Array);

      const wh1Stock = stockByWarehouse.find(
        (s: any) =>
          s.warehouseId === warehouseId1 || s.warehouse?.id === warehouseId1,
      );
      const wh2Stock = stockByWarehouse.find(
        (s: any) =>
          s.warehouseId === warehouseId2 || s.warehouse?.id === warehouseId2,
      );

      // WH1: 20 - 5 = 15, WH2: 10 + 5 = 15
      if (wh1Stock) {
        expect(wh1Stock.quantity).toBe(15);
      }
      if (wh2Stock) {
        expect(wh2Stock.quantity).toBe(15);
      }
    });
  });

  describe('GET /api/inventory/movements', () => {
    it('devuelve la página con su total y el resumen del periodo', async () => {
      // La pantalla pregunta «qué se movió en esta fecha»: necesita paginar y
      // necesita el resumen calculado sobre todo el filtro, no sobre la
      // página, porque es el número con el que se cuadra el día.
      const res = await request(app.getHttpServer())
        .get('/api/inventory/movements')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.total).toBeGreaterThanOrEqual(1);
      expect(res.body.resumen).toMatchObject({
        entradas: expect.any(Number),
        salidas: expect.any(Number),
        referencias: expect.any(Number),
        ajustes: expect.any(Number),
      });
      // Cada fila trae con qué producto fue, sin tener que pedirlo aparte.
      expect(res.body.data[0].productName).toBeTruthy();
    });

    it('acota a una fecha sin movimientos', async () => {
      const res = await request(app.getHttpServer())
        .get(
          '/api/inventory/movements?from=2019-01-01T00:00:00-05:00&to=2019-01-02T23:59:59-05:00',
        )
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.total).toBe(0);
      expect(res.body.data).toEqual([]);
      expect(res.body.resumen.entradas).toBe(0);
      expect(res.body.resumen.salidas).toBe(0);
    });

    it('el resumen no cambia al pasar de página', async () => {
      const completo = await request(app.getHttpServer())
        .get('/api/inventory/movements?limit=200&page=1')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const unaFila = await request(app.getHttpServer())
        .get('/api/inventory/movements?limit=1&page=1')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(unaFila.body.data).toHaveLength(1);
      expect(unaFila.body.total).toBe(completo.body.total);
      expect(unaFila.body.resumen).toEqual(completo.body.resumen);
    });
  });

  describe('GET /api/inventory/stock/variant/:variantId', () => {
    it('should return stock per warehouse for the variant', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/inventory/stock/variant/${variantId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toBeInstanceOf(Array);
      expect(res.body.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('GET /api/inventory/stock/warehouse/:warehouseId', () => {
    it('should return stock for a specific warehouse', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/inventory/stock/warehouse/${warehouseId1}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toBeInstanceOf(Array);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Cleanup: DELETE warehouses', () => {
    it('should delete warehouse 1', async () => {
      await request(app.getHttpServer())
        .delete(`/api/inventory/warehouses/${warehouseId1}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });

    it('should delete warehouse 2', async () => {
      await request(app.getHttpServer())
        .delete(`/api/inventory/warehouses/${warehouseId2}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });
  });
});
