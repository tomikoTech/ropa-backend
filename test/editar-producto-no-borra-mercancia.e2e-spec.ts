import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { setupTestApp, loginAsAdmin, teardownTestApp } from './helpers/setup';

/**
 * **Editar un producto no puede desactivar una talla que tiene mercancía.**
 *
 * Lo que pasó en una tienda: alguien editó un producto y el formulario mandó
 * una sola de sus dos variantes. El servidor trató la que faltaba como «esto ya
 * no existe»: intentó borrarla, no pudo porque tenía ventas, y la desactivó en
 * silencio. Tres cajas y 49 pares quedaron invisibles — al escanear su etiqueta
 * el punto de venta contestaba «este producto no está activo», con la caja en
 * la mano.
 *
 * La mercancía manda sobre el formulario.
 */
describe('Editar un producto respeta las variantes con mercancía (e2e)', () => {
  let app: INestApplication;
  let token: string;
  const ts = Date.now();
  const auth = () => ({ Authorization: `Bearer ${token}` });

  let productId: string;
  let variantes: { id: string; sku: string }[] = [];
  let warehouseId: string;

  beforeAll(async () => {
    app = await setupTestApp();
    token = await loginAsAdmin(app);

    const wh = await request(app.getHttpServer())
      .post('/api/inventory/warehouses')
      .set(auth())
      .send({
        name: `E2E Variantes WH ${ts}`,
        code: `VA-${ts.toString().slice(-5)}`,
        isPosLocation: true,
      })
      .expect(201);
    warehouseId = wh.body.id;

    const prod = await request(app.getHttpServer())
      .post('/api/products')
      .set(auth())
      .send({
        name: `E2EVAR Producto ${ts}`,
        basePrice: 100000,
        costPrice: 40000,
        variants: [
          { size: '40', color: 'Negro' },
          { size: '41', color: 'Negro' },
        ],
      })
      .expect(201);
    productId = prod.body.id;
    variantes = prod.body.variants;
    expect(variantes).toHaveLength(2);

    // La segunda talla recibe mercancía: es la que no se puede perder.
    await request(app.getHttpServer())
      .post('/api/inventory/adjust')
      .set(auth())
      .send({
        variantId: variantes[1].id,
        warehouseId,
        quantity: 24,
        movementType: 'IN',
        notes: 'Ingreso de prueba',
      })
      .expect((r) => {
        if (![200, 201].includes(r.status)) {
          throw new Error(`ajuste falló: ${r.status} ${JSON.stringify(r.body)}`);
        }
      });
  }, 120000);

  afterAll(async () => {
    await teardownTestApp();
  });

  it('guardar el producto con una sola variante no desactiva la otra', async () => {
    await request(app.getHttpServer())
      .patch(`/api/products/${productId}`)
      .set(auth())
      // El formulario manda solo la primera: la segunda "desaparece".
      .send({ variants: [{ id: variantes[0].id, size: '40', color: 'Negro' }] })
      .expect(200);

    const despues = await request(app.getHttpServer())
      .get(`/api/products/${productId}`)
      .set(auth())
      .expect(200);

    const conMercancia = (
      despues.body.variants as { id: string; isActive: boolean }[]
    ).find((v) => v.id === variantes[1].id);

    // Esto es lo que fallaba: la variante quedaba inactiva y su mercancía,
    // invisible.
    expect(conMercancia).toBeDefined();
    expect(conMercancia!.isActive).toBe(true);
  }, 60000);

  it('y se puede seguir vendiendo esa talla', async () => {
    await request(app.getHttpServer())
      .post('/api/pos/sales')
      .set(auth())
      .send({
        warehouseId,
        items: [{ variantId: variantes[1].id, quantity: 1, unitPrice: 100000 }],
        payments: [{ method: 'EFECTIVO', amount: 100000 }],
      })
      .expect(201);
  }, 60000);
});
