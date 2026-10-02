import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { setupTestApp, loginAsAdmin, teardownTestApp } from './helpers/setup';
import { crearTiendaDePerfumeria } from './helpers/perfumeria';
import { DataSource } from 'typeorm';

/**
 * **El perfil de negocio: una perfumería no ve esencias ni frascos al vender.**
 *
 * «Para qué quiero ver el frasco y la esencia, si yo solo voy a facturar
 * producto terminado». El servidor lo resuelve sin que la pantalla filtre
 * nada: en una tienda de perfumería, el catálogo del POS, el buscador y las
 * existencias traen solo el producto terminado salvo que se pida otro tipo a
 * propósito (las pestañas de Frascos y Esencias). Y la zapatería sigue
 * viendo todo, que es lo otro que hay que vigilar.
 */
describe('Perfil de negocio: perfumería (e2e)', () => {
  let app: INestApplication;
  let tokenCalzado: string;
  let tokenPerfumeria: string;
  const ts = Date.now();
  const con = (token: string) => ({ Authorization: `Bearer ${token}` });

  /** Una tienda con una loción, una esencia y un frasco, cada uno con stock. */
  async function surtir(token: string) {
    const h = con(token);
    const wh = await request(app.getHttpServer())
      .post('/api/inventory/warehouses')
      .set(h)
      .send({
        name: `E2E Perfil WH ${ts}`,
        code: `PF-${ts.toString().slice(-5)}`,
        isPosLocation: true,
      })
      .expect(201);
    const categoria = async (type: string) => {
      const r = await request(app.getHttpServer())
        .post('/api/categories')
        .set(h)
        .send({ name: `E2E ${type} ${ts}`, type })
        .expect(201);
      return r.body.id as string;
    };
    const cats = {
      STANDARD: await categoria('STANDARD'),
      ESSENCE: await categoria('ESSENCE'),
      FRASCO: await categoria('FRASCO'),
    };
    const nombres: Record<string, string> = {};
    for (const tipo of ['STANDARD', 'ESSENCE', 'FRASCO'] as const) {
      const nombre = `E2EPERFIL ${tipo} ${ts}`;
      nombres[tipo] = nombre;
      const p = await request(app.getHttpServer())
        .post('/api/products')
        .set(h)
        .send({
          name: nombre,
          basePrice: 50000,
          costPrice: 20000,
          categoryId: cats[tipo],
          variants: [{ size: 'U', color: 'Único' }],
        })
        .expect(201);
      await request(app.getHttpServer())
        .post('/api/inventory/adjust')
        .set(h)
        .send({
          variantId: p.body.variants[0].id,
          warehouseId: wh.body.id,
          quantity: 10,
          movementType: 'IN',
          notes: 'e2e',
        })
        .expect((res) => {
          if (res.status !== 200 && res.status !== 201)
            throw new Error(res.text);
        });
    }
    return { warehouseId: wh.body.id as string, nombres };
  }

  const catalogo = (token: string, extra = '') =>
    request(app.getHttpServer())
      .get(`/api/products/search/pos-catalog?q=E2EPERFIL&limit=50${extra}`)
      .set(con(token))
      .expect(200)
      .then((r) => (r.body.data as { name: string }[]).map((p) => p.name));

  const existencias = (token: string, extra = '') =>
    request(app.getHttpServer())
      .get(`/api/inventory/stock/paged?search=E2EPERFIL&limit=50${extra}`)
      .set(con(token))
      .expect(200)
      .then((r) =>
        (r.body.data as { variant: { product: { name: string } } }[]).map(
          (s) => s.variant.product.name,
        ),
      );

  beforeAll(async () => {
    app = await setupTestApp();
    tokenCalzado = await loginAsAdmin(app);
    tokenPerfumeria = (await crearTiendaDePerfumeria(app, ts)).token;
  }, 120000);

  afterAll(async () => {
    await teardownTestApp();
  });

  it('la tienda dice qué es, y una perfumería no lleva inventario por cajas', async () => {
    const s = await request(app.getHttpServer())
      .get('/api/store-settings')
      .set(con(tokenPerfumeria))
      .expect(200);
    expect(s.body.tipoDeNegocio).toBe('perfumeria');
    // Aunque alguien lo prenda: una loción no se etiqueta par por par.
    await request(app.getHttpServer())
      .patch('/api/store-settings')
      .set(con(tokenPerfumeria))
      .send({ unitTrackingEnabled: true })
      .expect(200);
    const otraVez = await request(app.getHttpServer())
      .get('/api/store-settings')
      .set(con(tokenPerfumeria))
      .expect(200);
    expect(otraVez.body.unitTrackingEnabled).toBe(false);
  }, 60000);

  it('un tipo de negocio que no existe se rechaza', async () => {
    await request(app.getHttpServer())
      .patch('/api/store-settings')
      .set(con(tokenPerfumeria))
      .send({ tipoDeNegocio: 'ferreteria' })
      .expect(400);
  });

  it('en la perfumería, el POS y las existencias traen solo el producto terminado', async () => {
    const { nombres } = await surtir(tokenPerfumeria);

    const pos = await catalogo(tokenPerfumeria);
    expect(pos).toContain(nombres.STANDARD);
    expect(pos).not.toContain(nombres.ESSENCE);
    expect(pos).not.toContain(nombres.FRASCO);

    const stock = await existencias(tokenPerfumeria);
    expect(stock).toContain(nombres.STANDARD);
    expect(stock).not.toContain(nombres.ESSENCE);
    expect(stock).not.toContain(nombres.FRASCO);

    // Las pestañas de Frascos y Esencias piden su tipo y lo reciben.
    expect(await existencias(tokenPerfumeria, '&type=ESSENCE')).toEqual([
      nombres.ESSENCE,
    ]);
    expect(await existencias(tokenPerfumeria, '&type=FRASCO')).toEqual([
      nombres.FRASCO,
    ]);
    expect(await catalogo(tokenPerfumeria, '&type=ESSENCE')).toEqual([
      nombres.ESSENCE,
    ]);
  }, 120000);

  it('la zapatería sigue viendo todo lo suyo', async () => {
    const { nombres } = await surtir(tokenCalzado);
    const pos = await catalogo(tokenCalzado);
    expect(pos).toEqual(
      expect.arrayContaining([
        nombres.STANDARD,
        nombres.ESSENCE,
        nombres.FRASCO,
      ]),
    );
    const stock = await existencias(tokenCalzado);
    expect(stock).toEqual(
      expect.arrayContaining([
        nombres.STANDARD,
        nombres.ESSENCE,
        nombres.FRASCO,
      ]),
    );
    const s = await request(app.getHttpServer())
      .get('/api/store-settings')
      .set(con(tokenCalzado))
      .expect(200);
    expect(s.body.tipoDeNegocio).toBe('calzado');
  }, 120000);
  it('en la perfumería se vende solo por la bodega de venta; las de insumos se rechazan', async () => {
    const h = con(tokenPerfumeria);
    const insumos = await request(app.getHttpServer())
      .post('/api/inventory/warehouses')
      .set(h)
      .send({
        name: `E2E ESENCIAS ${ts}`,
        code: `ES-${ts.toString().slice(-5)}`,
        isPosLocation: false,
      })
      .expect(201);
    const venta = await request(app.getHttpServer())
      .post('/api/inventory/warehouses')
      .set(h)
      .send({
        name: `E2E VENTA ${ts}`,
        code: `VT-${ts.toString().slice(-5)}`,
        isPosLocation: true,
      })
      .expect(201);
    const p = await request(app.getHttpServer())
      .post('/api/products')
      .set(h)
      .send({
        name: `E2EPERFIL Locion bodega ${ts}`,
        basePrice: 50000,
        variants: [{ size: 'U', color: 'Único' }],
      })
      .expect(201);
    const variantId = p.body.variants[0].id as string;
    for (const wh of [insumos.body.id, venta.body.id]) {
      await request(app.getHttpServer())
        .post('/api/inventory/adjust')
        .set(h)
        .send({
          variantId,
          warehouseId: wh,
          quantity: 5,
          movementType: 'IN',
          notes: 'e2e',
        })
        .expect((res) => {
          if (res.status !== 200 && res.status !== 201)
            throw new Error(res.text);
        });
    }
    const vender = (warehouseId: string) =>
      request(app.getHttpServer())
        .post('/api/pos/sales')
        .set(h)
        .send({
          warehouseId,
          items: [{ variantId, quantity: 1, unitPrice: 50000 }],
          payments: [{ method: 'EFECTIVO', amount: 50000 }],
        });
    const rechazada = await vender(insumos.body.id).expect(400);
    expect(rechazada.body.message).toContain('no es una bodega de venta');
    await vender(venta.body.id).expect(201);
  }, 120000);

  it('el pedido del catálogo pide teléfono y dirección, y siempre va a domicilio', async () => {
    const h = con(tokenPerfumeria);
    await request(app.getHttpServer())
      .patch('/api/store-settings')
      .set(h)
      .send({ catalogoEnabled: true })
      .expect(200);
    const s = await request(app.getHttpServer())
      .get('/api/store-settings')
      .set(h)
      .expect(200);
    const slug = s.body.storeSlug as string;
    const wh = await request(app.getHttpServer())
      .post('/api/inventory/warehouses')
      .set(h)
      .send({
        name: `E2E Pedidos WH ${ts}`,
        code: `PD-${ts.toString().slice(-5)}`,
        isPosLocation: true,
      })
      .expect(201);
    const p = await request(app.getHttpServer())
      .post('/api/products')
      .set(h)
      .send({
        name: `E2EPERFIL Locion pedido ${ts}`,
        basePrice: 50000,
        isPublished: true,
        variants: [{ size: 'U', color: 'Único' }],
      })
      .expect(201);
    const variantId = p.body.variants[0].id as string;
    await request(app.getHttpServer())
      .post('/api/inventory/adjust')
      .set(h)
      .send({
        variantId,
        warehouseId: wh.body.id,
        quantity: 5,
        movementType: 'IN',
        notes: 'e2e',
      })
      .expect((res) => {
        if (res.status !== 200 && res.status !== 201) throw new Error(res.text);
      });
    // Sin bodega configurada la tienda no recibe pedidos: es la de venta.
    await request(app.getHttpServer())
      .patch('/api/store-settings')
      .set(h)
      .send({ defaultWarehouseId: wh.body.id })
      .expect(200);
    // El catálogo le dice al carrito que pida dirección.
    const cat = await request(app.getHttpServer())
      .get(`/api/storefront/${slug}/catalogo`)
      .expect(200);
    expect(cat.body.tienda.pedidoSiempreADomicilio).toBe(true);

    const pedir = (body: Record<string, unknown>) =>
      request(app.getHttpServer())
        .post(`/api/storefront/${slug}/orders`)
        .send({
          customerName: 'Local Perfuar',
          items: [{ variantId, quantity: 2 }],
          ...body,
        });
    const sinTelefono = await pedir({
      customerEmail: 'x@y.co',
      shippingAddress: 'CC Unico local 12',
    }).expect(400);
    expect(sinTelefono.body.message).toContain('teléfono');
    const sinDireccion = await pedir({ customerPhone: '3001234567' }).expect(
      400,
    );
    expect(sinDireccion.body.message).toContain('dirección');
    const ok = await pedir({
      customerPhone: '3001234567',
      shippingAddress: 'CC Unico local 12',
      deliveryMethod: 'pickup',
    });
    if (ok.status !== 201) throw new Error(`pedido: ${ok.status} ${ok.text}`);
    expect(ok.body.whatsappUrl).toContain(
      encodeURIComponent('sujetos a confirmación'),
    );
    const ds = app.get(DataSource);
    const [fila]: { delivery_method: string; shipping_address: string }[] =
      await ds.query(
        `SELECT delivery_method, shipping_address FROM ecommerce_orders WHERE id = $1`,
        [ok.body.orderId],
      );
    // Aunque el carrito dijera «recoger», en la perfumería es a domicilio.
    expect(fila.delivery_method).toBe('shipping');
    expect(fila.shipping_address).toBe('CC Unico local 12');
  }, 120000);

  it('la cuenta de producción recibe la compra y no ve las ventas', async () => {
    const h = con(tokenPerfumeria);
    const rol = await request(app.getHttpServer())
      .post('/api/access/roles')
      .set(h)
      .send({ name: `Producción ${ts}`, templateKey: 'produccion' })
      .expect(201);
    const correo = `cesar-${ts}@e2e.co`;
    const u = await request(app.getHttpServer())
      .post('/api/users')
      .set(h)
      .send({
        email: correo,
        password: 'cesar-e2e-1234',
        firstName: 'César',
        lastName: 'E2E',
        role: 'COLABORADOR',
      })
      .expect(201);
    // El rol se asigna por Acceso, no por Usuarios: es la ruta de la matriz.
    await request(app.getHttpServer())
      .patch(`/api/access/users/${u.body.id}`)
      .set(h)
      .send({ accessRoleId: rol.body.id })
      .expect(200);
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: correo, password: 'cesar-e2e-1234' })
      .expect(201);
    const cesar = con(login.body.accessToken as string);

    // Andrea arma la compra y la manda; César dice cuánto llegó.
    const sup = await request(app.getHttpServer())
      .post('/api/suppliers')
      .set(h)
      .send({
        name: `E2E Esencias SAS ${ts}`,
        nit: `901${ts.toString().slice(-6)}-1`,
      })
      .expect(201);
    const wh = await request(app.getHttpServer())
      .post('/api/inventory/warehouses')
      .set(h)
      .send({
        name: `E2E Insumos WH ${ts}`,
        code: `IN-${ts.toString().slice(-5)}`,
      })
      .expect(201);
    const p = await request(app.getHttpServer())
      .post('/api/products')
      .set(h)
      .send({
        name: `E2EPERFIL Esencia compra ${ts}`,
        basePrice: 1000,
        costPrice: 500,
        variants: [{ size: 'U', color: 'Único' }],
      })
      .expect(201);
    const orden = await request(app.getHttpServer())
      .post('/api/purchases')
      .set(h)
      .send({
        supplierId: sup.body.id,
        warehouseId: wh.body.id,
        items: [
          {
            variantId: p.body.variants[0].id,
            quantityOrdered: 100,
            unitCost: 500,
          },
        ],
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/purchases/${orden.body.id}/send`)
      .set(h)
      .expect(201);

    const recibida = await request(app.getHttpServer())
      .post(`/api/purchases/${orden.body.id}/receive`)
      .set(cesar)
      .send({
        items: [{ itemId: orden.body.items[0].id, quantityReceived: 100 }],
      })
      .expect(201);
    expect(recibida.body.status).toBe('RECEIVED');
    await request(app.getHttpServer())
      .get('/api/pos/sales')
      .set(cesar)
      .expect(403);
  }, 120000);
});
