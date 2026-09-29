import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { setupTestApp, loginAsAdmin, teardownTestApp } from './helpers/setup';

/**
 * **Vender todo a un mismo precio, por debajo del mínimo.**
 *
 * El pedido, con el negocio enfrente: «si el precio que yo coloqué en vender
 * todo al mismo precio es menor a ese precio mínimo, que yo lo pueda vender
 * sin problema… como una especie de wildcard». Doscientos pares a 80.000: el
 * dueño ya decidió a cuánto sale la mercancía.
 *
 * Lo que se fija acá es que la llave abra **solo** lo que tiene que abrir: el
 * piso cede con la marca y sigue mandando sin ella, y el precio fijo —que no
 * es un piso sino un precio cerrado— no cede nunca.
 */
describe('Precio único en la venta (e2e)', () => {
  let app: INestApplication;
  let token: string;
  const ts = Date.now();
  const auth = () => ({ Authorization: `Bearer ${token}` });

  let warehouseId: string;
  let conPiso: string;
  let conPrecioFijo: string;

  const vender = (variantId: string, unitPrice: number, precioUnico?: boolean) =>
    request(app.getHttpServer())
      .post('/api/pos/sales')
      .set(auth())
      .send({
        warehouseId,
        items: [{ variantId, quantity: 1, unitPrice, precioUnico }],
        payments: [{ method: 'EFECTIVO', amount: unitPrice }],
      });

  beforeAll(async () => {
    app = await setupTestApp();
    token = await loginAsAdmin(app);

    const wh = await request(app.getHttpServer())
      .post('/api/inventory/warehouses')
      .set(auth())
      .send({
        name: `E2E PrecioUnico WH ${ts}`,
        code: `PU-${ts.toString().slice(-5)}`,
        isPosLocation: true,
      })
      .expect(201);
    warehouseId = wh.body.id;

    const crear = async (nombre: string, extra: Record<string, unknown>) => {
      const r = await request(app.getHttpServer())
        .post('/api/products')
        .set(auth())
        .send({
          name: `E2EPU ${nombre} ${ts}`,
          basePrice: 150000,
          costPrice: 50000,
          variants: [{ size: 'U', color: 'Negro' }],
          ...extra,
        })
        .expect(201);
      const variantId = r.body.variants[0].id as string;
      await request(app.getHttpServer())
        .post('/api/inventory/adjust')
        .set(auth())
        .send({
          variantId,
          warehouseId,
          quantity: 20,
          movementType: 'IN',
          notes: 'e2e',
        })
        .expect((res) => {
          if (res.status !== 200 && res.status !== 201) {
            throw new Error(`No se pudo cargar stock: ${res.status} ${res.text}`);
          }
        });
      return variantId;
    };

    conPiso = await crear('ConPiso', { minimumSalePrice: 100000 });
    conPrecioFijo = await crear('Fijo', { fixedPrice: true });
  }, 180000);

  afterAll(async () => {
    await teardownTestApp();
  });

  it('sin la marca, el piso manda: no deja vender más barato', async () => {
    const r = await vender(conPiso, 80_000).expect(400);
    expect(String(r.body.message)).toMatch(/100\.000/);
  }, 60000);

  it('con precio único, vende por debajo del piso', async () => {
    const r = await vender(conPiso, 80_000, true).expect(201);
    const detalle = await request(app.getHttpServer())
      .get(`/api/pos/sales/${r.body.id}`)
      .set(auth())
      .expect(200);
    // El precio que llega a la factura es el que puso el dueño, no el piso.
    expect(Number(detalle.body.items[0].unitPrice)).toBe(80_000);
    expect(Number(detalle.body.total)).toBe(80_000);
  }, 60000);

  it('el precio fijo no cede ni con precio único', async () => {
    // Es un precio cerrado, no un piso: «si tienen un precio, eso no tiene
    // descuento para nadie».
    const r = await vender(conPrecioFijo, 80_000, true).expect(400);
    expect(String(r.body.message)).toMatch(/precio fijo/i);
  }, 60000);

  it('la venta hecha con precio único se puede corregir después', async () => {
    // Sin esto, editar la cantidad de una factura de precio único la
    // rechazaría por el mismo piso que en su momento sí se dejó pasar.
    const venta = await vender(conPiso, 80_000, true).expect(201);
    await request(app.getHttpServer())
      .patch(`/api/pos/sales/${venta.body.id}`)
      .set(auth())
      .send({
        items: [
          { variantId: conPiso, quantity: 2, unitPrice: 80_000, precioUnico: true },
        ],
      })
      .expect(200);
    const detalle = await request(app.getHttpServer())
      .get(`/api/pos/sales/${venta.body.id}`)
      .set(auth())
      .expect(200);
    expect(Number(detalle.body.items[0].quantity)).toBe(2);
    expect(Number(detalle.body.items[0].unitPrice)).toBe(80_000);
  }, 60000);
});
