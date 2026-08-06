import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { setupTestApp, loginAsAdmin, teardownTestApp } from './helpers/setup';

/**
 * Regresión de los registros que fallaban con "Error interno del servidor".
 *
 * Caso original (tenant Distri Amber): crear una esencia devolvía 500. El
 * prefijo de SKU se trunca a 6 caracteres, así que toda "Esencia X" produce
 * "ESENCI"; ante la colisión, el código usaba "ESENCI" + total de productos del
 * tenant, valor que ya existía → violación del índice único (tenant_id,
 * sku_prefix) → 500 en la cara del usuario.
 *
 * Ningún registro debe responder 5xx: los conflictos reales son 4xx con un
 * mensaje accionable en español.
 */
describe('Registro robusto (e2e)', () => {
  let app: INestApplication;
  let token: string;
  const createdProductIds: string[] = [];
  const createdWarehouseIds: string[] = [];
  const stamp = Date.now();

  beforeAll(async () => {
    app = await setupTestApp();
    token = await loginAsAdmin(app);
  }, 30000);

  afterAll(async () => {
    for (const id of createdProductIds) {
      await request(app.getHttpServer())
        .delete(`/api/products/${id}`)
        .set('Authorization', `Bearer ${token}`);
    }
    for (const id of createdWarehouseIds) {
      await request(app.getHttpServer())
        .delete(`/api/inventory/warehouses/${id}`)
        .set('Authorization', `Bearer ${token}`);
    }
    await teardownTestApp();
  });

  const createProduct = (name: string) =>
    request(app.getHttpServer())
      .post('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name,
        basePrice: 10000,
        gender: 'UNISEX',
        variants: [{ size: 'Única', color: 'Único' }],
      });

  describe('POST /api/products — nombres que comparten prefijo', () => {
    it('crea varias esencias seguidas sin error interno y con SKU distinto', async () => {
      const names = [
        `Esencia Amber ${stamp}`,
        `Esencia Versace Bright ${stamp}`,
        `Esencia Vainilla ${stamp}`,
        `Esencia Coco ${stamp}`,
        `Esencia Sandalo ${stamp}`,
      ];

      const prefixes: string[] = [];
      for (const name of names) {
        const res = await createProduct(name);

        expect(res.status).toBe(201);
        createdProductIds.push(res.body.id);
        expect(prefixes).not.toContain(res.body.skuPrefix);
        prefixes.push(res.body.skuPrefix);
      }
    }, 30000);

    it('sigue creando esencias después de borrar productos (el consecutivo no depende del conteo)', async () => {
      const primero = await createProduct(`Esencia Borrable ${stamp}`);
      expect(primero.status).toBe(201);

      await request(app.getHttpServer())
        .delete(`/api/products/${primero.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // Con el prefijo derivado del conteo de productos, este alta chocaba con
      // un prefijo ya existente y respondía 500.
      const segundo = await createProduct(`Esencia Despues de Borrar ${stamp}`);
      expect(segundo.status).toBe(201);
      createdProductIds.push(segundo.body.id);
    }, 30000);

    it('crea productos con nombres sin letras ni números', async () => {
      const res = await createProduct('★★★ ' + stamp);
      expect(res.status).toBe(201);
      expect(res.body.skuPrefix).toBeTruthy();
      createdProductIds.push(res.body.id);
    }, 20000);

    it('crea dos productos con el mismo nombre sin romper la unicidad', async () => {
      const name = `Producto Duplicado ${stamp}`;
      const a = await createProduct(name);
      const b = await createProduct(name);

      expect(a.status).toBe(201);
      expect(b.status).toBe(201);
      createdProductIds.push(a.body.id, b.body.id);
      expect(a.body.skuPrefix).not.toBe(b.body.skuPrefix);
      expect(a.body.slug).not.toBe(b.body.slug);
    }, 30000);

    it('crea productos en paralelo sin duplicar prefijos ni fallar', async () => {
      const responses = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          createProduct(`Esencia Paralela ${stamp} ${i}`),
        ),
      );

      for (const res of responses) {
        expect(res.status).toBe(201);
        createdProductIds.push(res.body.id);
      }
      const prefixes = responses.map((r) => r.body.skuPrefix);
      expect(new Set(prefixes).size).toBe(prefixes.length);
    }, 40000);
  });

  describe('POST /api/products — datos inválidos responden 4xx, nunca 5xx', () => {
    it('rechaza una categoría inexistente con 404 y mensaje claro', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/products')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: `Producto Categoria Mala ${stamp}`,
          basePrice: 1000,
          variants: [],
          categoryId: '00000000-0000-0000-0000-000000000000',
        });

      expect(res.status).toBe(404);
      expect(res.body.message).toMatch(/categor/i);
    });

    it('rechaza un categoryId que no es UUID con 400 (no 500)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/products')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: `Producto UUID Malo ${stamp}`,
          basePrice: 1000,
          variants: [],
          categoryId: 'no-es-un-uuid',
        });

      expect(res.status).toBe(400);
    });

    it('rechaza un frasco inexistente con 404 (no 500 por llave foránea)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/products')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: `Producto Frasco Malo ${stamp}`,
          basePrice: 1000,
          variants: [],
          frascoVariantId: '00000000-0000-0000-0000-000000000000',
        });

      expect(res.status).toBe(404);
    });

    it('rechaza un precio negativo con 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/products')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: `Producto Precio Malo ${stamp}`,
          basePrice: -1,
          variants: [],
        });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/inventory/warehouses — código autogenerado', () => {
    it('crea bodegas consecutivas y las recrea tras borrarlas', async () => {
      const primera = await request(app.getHttpServer())
        .post('/api/inventory/warehouses')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: `Bodega Test ${stamp} A` });
      expect(primera.status).toBe(201);

      await request(app.getHttpServer())
        .delete(`/api/inventory/warehouses/${primera.body.id}`)
        .set('Authorization', `Bearer ${token}`);

      // Con el código derivado del conteo, esta alta reutilizaba un BOD-XXX ya
      // existente y respondía 500.
      const segunda = await request(app.getHttpServer())
        .post('/api/inventory/warehouses')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: `Bodega Test ${stamp} B` });
      expect(segunda.status).toBe(201);
      createdWarehouseIds.push(segunda.body.id);
    }, 30000);

    it('rechaza un nombre de bodega repetido con 409', async () => {
      const name = `Bodega Repetida ${stamp}`;
      const primera = await request(app.getHttpServer())
        .post('/api/inventory/warehouses')
        .set('Authorization', `Bearer ${token}`)
        .send({ name });
      expect(primera.status).toBe(201);
      createdWarehouseIds.push(primera.body.id);

      const segunda = await request(app.getHttpServer())
        .post('/api/inventory/warehouses')
        .set('Authorization', `Bearer ${token}`)
        .send({ name });
      expect(segunda.status).toBe(409);
      expect(segunda.body.message).toMatch(/nombre/i);
    }, 30000);
  });

  describe('Otros registros no devuelven 5xx ante datos inválidos', () => {
    it('cliente: documento repetido responde 409', async () => {
      const documentNumber = `DOC${stamp}`;
      const primero = await request(app.getHttpServer())
        .post('/api/clients')
        .set('Authorization', `Bearer ${token}`)
        .send({ firstName: 'Prueba', lastName: 'Uno', documentNumber });
      expect(primero.status).toBe(201);

      const segundo = await request(app.getHttpServer())
        .post('/api/clients')
        .set('Authorization', `Bearer ${token}`)
        .send({ firstName: 'Prueba', lastName: 'Dos', documentNumber });
      expect(segundo.status).toBe(409);

      await request(app.getHttpServer())
        .delete(`/api/clients/${primero.body.id}`)
        .set('Authorization', `Bearer ${token}`);
    }, 30000);

    it('proveedor: NIT repetido responde 409', async () => {
      const nit = `NIT${stamp}`;
      const primero = await request(app.getHttpServer())
        .post('/api/suppliers')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: `Proveedor ${stamp}`, nit });
      expect(primero.status).toBe(201);

      const segundo = await request(app.getHttpServer())
        .post('/api/suppliers')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: `Proveedor bis ${stamp}`, nit });
      expect(segundo.status).toBe(409);

      await request(app.getHttpServer())
        .delete(`/api/suppliers/${primero.body.id}`)
        .set('Authorization', `Bearer ${token}`);
    }, 30000);

    it('categoría: nombre repetido responde 409', async () => {
      const name = `Categoria ${stamp}`;
      const primera = await request(app.getHttpServer())
        .post('/api/categories')
        .set('Authorization', `Bearer ${token}`)
        .send({ name });
      expect(primera.status).toBe(201);

      const segunda = await request(app.getHttpServer())
        .post('/api/categories')
        .set('Authorization', `Bearer ${token}`)
        .send({ name });
      expect(segunda.status).toBe(409);

      await request(app.getHttpServer())
        .delete(`/api/categories/${primera.body.id}`)
        .set('Authorization', `Bearer ${token}`);
    }, 30000);

    it('venta: variante inexistente responde 4xx, no 500', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/pos/sales')
        .set('Authorization', `Bearer ${token}`)
        .send({
          warehouseId: '00000000-0000-0000-0000-000000000000',
          items: [
            {
              variantId: '00000000-0000-0000-0000-000000000000',
              quantity: 1,
            },
          ],
          payments: [{ method: 'EFECTIVO', amount: 1000 }],
        });

      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    }, 20000);
  });
});
