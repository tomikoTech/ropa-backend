import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { setupTestApp, loginAsAdmin, teardownTestApp } from './helpers/setup';

/**
 * **Vender con descuento.**
 *
 * En AMAWAD no se podía cobrar una venta con 33% de descuento. El servidor
 * contestaba una cifra que no se puede leer en voz alta:
 *
 *     Pago insuficiente. Total: $30753, Pagado: $30752.999999999996
 *
 * El carrito manda como pago lo que le mostró al cliente —`precio × (1 -
 * 33/100)`, de un solo golpe— y el servidor calcula el descuento aparte y lo
 * resta, redondeando cada renglón a dos decimales. En coma flotante esos dos
 * caminos no dan lo mismo, y el del carrito daba menos. Comparados con `<` a
 * pelo, la venta se caía.
 *
 * Esta prueba manda **exactamente** lo que manda el carrito: el número con su
 * cola de decimales, sin redondear. Redondearlo acá haría pasar la prueba sin
 * arreglar nada, que es la peor forma de estar tranquilo.
 */
describe('Vender con descuento (e2e)', () => {
  let app: INestApplication;
  let token: string;
  const ts = Date.now();
  const auth = () => ({ Authorization: `Bearer ${token}` });

  let variantId: string;
  let warehouseId: string;

  /** El total tal como lo calcula el carrito, con su cola de decimales. */
  const comoElCarrito = (precio: number, cantidad: number, desc: number) =>
    precio * cantidad * (1 - desc / 100);

  const vender = (
    precio: number,
    cantidad: number,
    descuento: number,
    pagado: number,
  ) =>
    request(app.getHttpServer())
      .post('/api/pos/sales')
      .set(auth())
      .send({
        warehouseId,
        items: [
          {
            variantId,
            quantity: cantidad,
            unitPrice: precio,
            discountPercent: descuento,
          },
        ],
        payments: [{ method: 'EFECTIVO', amount: pagado }],
      });

  beforeAll(async () => {
    app = await setupTestApp();
    token = await loginAsAdmin(app);

    const wh = await request(app.getHttpServer())
      .post('/api/inventory/warehouses')
      .set(auth())
      .send({
        name: `E2E Descuento WH ${ts}`,
        code: `DE-${ts.toString().slice(-5)}`,
        isPosLocation: true,
      })
      .expect(201);
    warehouseId = wh.body.id;

    const prod = await request(app.getHttpServer())
      .post('/api/products')
      .set(auth())
      .send({
        name: `E2EDESC Producto ${ts}`,
        basePrice: 45900,
        costPrice: 20000,
        variants: [{ size: 'U', color: 'Negro' }],
      })
      .expect(201);
    variantId = prod.body.variants[0].id;

    await request(app.getHttpServer())
      .post('/api/inventory/adjust')
      .set(auth())
      .send({
        variantId,
        warehouseId,
        quantity: 500,
        movementType: 'IN',
        notes: 'Carga inicial de la prueba',
      })
      .expect((r) => {
        if (r.status !== 200 && r.status !== 201) {
          throw new Error(`No se pudo cargar stock: ${r.status} ${r.text}`);
        }
      });
  }, 180000);

  afterAll(async () => {
    await teardownTestApp();
  });

  it('cobra la venta exacta que no dejaba: 45.900 con 33%', async () => {
    const pagado = comoElCarrito(45_900, 1, 33);
    // La cola de decimales es el punto de la prueba: si esto fuera un entero,
    // no estaría probando nada.
    expect(pagado).not.toBe(Math.round(pagado));

    const venta = await vender(45_900, 1, 33, pagado).expect(201);
    expect(Number(venta.body.total)).toBeCloseTo(30_753, 2);
  }, 60000);

  it('los descuentos del mostrador no bloquean ninguna cantidad', async () => {
    // 7% y 33% son los dos que más aparecen; 3 y 6 unidades porque el error
    // crece con la cantidad.
    for (const desc of [7, 33]) {
      for (const cantidad of [1, 3, 6]) {
        const pagado = comoElCarrito(45_900, cantidad, desc);
        await vender(45_900, cantidad, desc, pagado).expect((r) => {
          if (r.status !== 201) {
            throw new Error(
              `${cantidad} u. con ${desc}% de descuento no dejó vender: ` +
                `${r.status} ${r.text}`,
            );
          }
        });
      }
    }
  }, 120000);

  it('pero un pago realmente corto sigue sin pasar', async () => {
    // Lo que este arreglo no puede hacer es dejar cobrar de menos: 30.000 por
    // algo que vale 30.753 son 753 pesos que faltan en la caja, no ruido.
    const r = await vender(45_900, 1, 33, 30_000).expect(400);
    expect(r.body.message).toContain('Pago insuficiente');
  }, 60000);

  it('un centavo de menos también se frena', async () => {
    const r = await vender(45_900, 1, 33, 30_752.99).expect(400);
    expect(r.body.message).toContain('Pago insuficiente');
  }, 60000);
});
