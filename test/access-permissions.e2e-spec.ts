import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { setupTestApp, loginAsAdmin, teardownTestApp } from './helpers/setup';

/**
 * F8 — permisos granulares por módulo y acción.
 *
 * Lo que de verdad hay que probar aquí no es que la pantalla esconda un botón,
 * sino que **el servidor rechace la petición**. El sistema anterior tiene varias
 * de sus reglas solo en el JavaScript, y por eso llamando su API directamente se
 * las salta. Así que cada caso llama la API con el token del usuario limitado.
 *
 * También comprueba lo contrario, que es igual de importante: un usuario **sin**
 * rol de acceso asignado sigue funcionando exactamente como antes.
 */
describe('Permisos granulares (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  const suffix = Date.now();

  // Usuario con rol "Cajero" (matriz de la plantilla).
  const cajeroEmail = `e2e-cajero-${suffix}@test.co`;
  const cajeroPass = 'cajero12345';
  let cajeroId: string;
  let cajeroToken: string;
  let cajeroRoleId: string;

  // Usuario colaborador SIN rol de acceso: el control de que nada cambió.
  const legacyEmail = `e2e-legacy-${suffix}@test.co`;
  const legacyPass = 'legacy12345';
  let legacyToken: string;

  let warehouseAId: string;
  let warehouseBId: string;
  let variantId: string;

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  const login = async (email: string, password: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(201);
    return res.body.accessToken;
  };

  beforeAll(async () => {
    app = await setupTestApp();
    adminToken = await loginAsAdmin(app);

    // Dos bodegas para probar la restricción por bodega.
    for (const letra of ['A', 'B']) {
      const wh = await request(app.getHttpServer())
        .post('/api/inventory/warehouses')
        .set(auth(adminToken))
        .send({
          name: `E2E Acc WH ${letra} ${suffix}`,
          code: `ACC${letra}-${suffix}`,
          isPosLocation: true,
        })
        .expect(201);
      if (letra === 'A') warehouseAId = wh.body.id;
      else warehouseBId = wh.body.id;
    }

    const product = await request(app.getHttpServer())
      .post('/api/products')
      .set(auth(adminToken))
      .send({
        name: `E2E Acc Producto ${suffix}`,
        basePrice: 30000,
        costPrice: 10000,
        taxRate: 0,
        variants: [{ size: '40', color: 'Negro acceso' }],
      })
      .expect(201);
    variantId = product.body.variants[0].id;

    // Stock en las DOS bodegas, para que el rechazo sea por permisos y no por
    // falta de inventario.
    for (const warehouseId of [warehouseAId, warehouseBId]) {
      await request(app.getHttpServer())
        .post('/api/inventory/adjust')
        .set(auth(adminToken))
        .send({
          variantId,
          warehouseId,
          quantity: 10,
          movementType: 'IN',
          notes: 'stock para prueba de accesos',
        })
        .expect(201);
    }

    for (const [email, password] of [
      [cajeroEmail, cajeroPass],
      [legacyEmail, legacyPass],
    ]) {
      const res = await request(app.getHttpServer())
        .post('/api/users')
        .set(auth(adminToken))
        .send({
          email,
          password,
          firstName: 'E2E',
          lastName: email === cajeroEmail ? 'Cajero' : 'Legacy',
          role: 'COLABORADOR',
        })
        .expect(201);
      if (email === cajeroEmail) cajeroId = res.body.id;
    }
    legacyToken = await login(legacyEmail, legacyPass);
  }, 90000);

  afterAll(async () => {
    await teardownTestApp();
  });

  // ── Catálogo y plantillas ─────────────────────────────────────────────────

  it('GET /access/catalog → módulos, las 4 acciones y las 6 plantillas', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/access/catalog')
      .set(auth(adminToken))
      .expect(200);

    expect(res.body.actions.map((a: { key: string }) => a.key)).toEqual([
      'list',
      'create',
      'edit',
      'delete',
    ]);
    expect(res.body.templates.map((t: { name: string }) => t.name)).toEqual([
      'Administrador',
      'Gerente',
      'Cajero',
      'Jefe de Bodega',
      'Inventario',
      'Consulta',
    ]);
    // Los módulos vienen con etiqueta y grupo, para poder pintar la matriz.
    for (const m of res.body.modules) {
      expect(m.label).toBeTruthy();
      expect(m.group).toBeTruthy();
    }
  });

  it('GET /access/templates/cajero → la matriz que se verificó en demachine', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/access/templates/cajero')
      .set(auth(adminToken))
      .expect(200);

    const perm = (k: string) =>
      res.body.permissions.find((p: { module: string }) => p.module === k);
    expect(perm('products').list).toBe(false);
    expect(perm('clients').create).toBe(true);
    expect(perm('sales').create).toBe(true);
    expect(perm('sales').edit).toBe(false);
  });

  it('una plantilla que no existe → 404 diciendo cuáles hay', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/access/templates/no-existe')
      .set(auth(adminToken))
      .expect(404);
    expect(res.body.message).toContain('cajero');
  });

  // ── Crear el rol y asignarlo ──────────────────────────────────────────────

  it('POST /access/roles → crea el rol desde la plantilla Cajero', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/access/roles')
      .set(auth(adminToken))
      .send({
        name: `Cajero ${suffix}`,
        description: 'Vende y cobra',
        templateKey: 'cajero',
      })
      .expect(201);

    cajeroRoleId = res.body.id;
    expect(res.body.templateKey).toBe('cajero');
    const perm = (k: string) =>
      res.body.permissions.find((p: { module: string }) => p.module === k);
    expect(perm('products').list).toBe(false);
    expect(perm('sales').create).toBe(true);
    expect(perm('sales').edit).toBe(false);
  });

  it('dos roles con el mismo nombre → 409 que dice qué hacer', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/access/roles')
      .set(auth(adminToken))
      .send({ name: `Cajero ${suffix}`, templateKey: 'cajero' })
      .expect(409);
    expect(res.body.message).toContain('Ya existe');
  });

  it('un rol sin ningún permiso no se puede asignar', async () => {
    // Alguien no puede quedar con un rol que le impida hasta entrar; el error
    // dice qué falta en vez de dejarlo pasar y que el usuario se estrelle.
    const vacio = await request(app.getHttpServer())
      .post('/api/access/roles')
      .set(auth(adminToken))
      .send({ name: `Vacío ${suffix}` })
      .expect(201);

    const res = await request(app.getHttpServer())
      .patch(`/api/access/users/${cajeroId}`)
      .set(auth(adminToken))
      .send({ accessRoleId: vacio.body.id })
      .expect(400);
    expect(res.body.message).toContain('permiso');

    await request(app.getHttpServer())
      .delete(`/api/access/roles/${vacio.body.id}`)
      .set(auth(adminToken))
      .expect(200);
  });

  it('PATCH /access/users/:id → asigna el rol y el usuario lo ve en /access/me', async () => {
    await request(app.getHttpServer())
      .patch(`/api/access/users/${cajeroId}`)
      .set(auth(adminToken))
      .send({ accessRoleId: cajeroRoleId })
      .expect(200);

    cajeroToken = await login(cajeroEmail, cajeroPass);

    const me = await request(app.getHttpServer())
      .get('/api/access/me')
      .set(auth(cajeroToken))
      .expect(200);
    expect(me.body.unrestricted).toBe(false);
    expect(me.body.roleName).toBe(`Cajero ${suffix}`);
    const perm = (k: string) =>
      me.body.permissions.find((p: { module: string }) => p.module === k);
    expect(perm('sales').create).toBe(true);
    expect(perm('products').list).toBe(false);
  });

  // ── El guard: lo que importa ──────────────────────────────────────────────

  it('el servidor RECHAZA lo que el rol no permite, con un mensaje que se entiende', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/products')
      .set(auth(cajeroToken))
      .expect(403);
    expect(res.body.message).toContain('Productos');
    expect(res.body.message).toContain(`Cajero ${suffix}`);
    expect(res.body.message).toContain('administrador');
  });

  it('deja pasar lo que el rol sí permite', async () => {
    await request(app.getHttpServer())
      .get('/api/pos/sales')
      .set(auth(cajeroToken))
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/clients')
      .set(auth(cajeroToken))
      .send({
        firstName: `Cliente del cajero ${suffix}`,
        lastName: 'Prueba',
        documentNumber: `ACC-${suffix}`,
      })
      .expect(201);
  });

  it('distingue crear de editar: el Cajero vende pero no anula', async () => {
    // "Crear" es cerrar una venta; anularla es editar, y eso el Cajero no lo
    // tiene. Sin esa distinción, dar permiso de vender daría permiso de anular.
    const venta = await request(app.getHttpServer())
      .post('/api/pos/sales')
      .set(auth(cajeroToken))
      .send({
        warehouseId: warehouseAId,
        items: [{ variantId, quantity: 1 }],
        payments: [
          { method: 'EFECTIVO', amount: 30000, receivedAmount: 30000 },
        ],
      })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post(`/api/pos/sales/${venta.body.id}/cancel`)
      .set(auth(cajeroToken))
      .send({ reason: 'prueba' })
      .expect(403);
    expect(res.body.message).toContain('Editar');
  });

  it('un colaborador sin rol de acceso sigue funcionando como siempre', async () => {
    // Es la garantía de que activar los permisos no le cambia el día a nadie
    // hasta que se le asigne un rol.
    await request(app.getHttpServer())
      .get('/api/products')
      .set(auth(legacyToken))
      .expect(200);

    const me = await request(app.getHttpServer())
      .get('/api/access/me')
      .set(auth(legacyToken))
      .expect(200);
    expect(me.body.unrestricted).toBe(true);
  });

  it('un colaborador no puede administrar roles ni con rol ni sin rol', async () => {
    // La administración de accesos es la llave del sistema: además de la matriz
    // exige ser administrador.
    for (const token of [legacyToken, cajeroToken]) {
      await request(app.getHttpServer())
        .get('/api/access/roles')
        .set(auth(token))
        .expect(403);
    }
  });

  it('el admin no queda restringido por su propia matriz', async () => {
    const me = await request(app.getHttpServer())
      .get('/api/access/me')
      .set(auth(adminToken))
      .expect(200);
    expect(me.body.unrestricted).toBe(true);
  });

  // ── Bodegas por usuario (el Userbodega de demachine) ──────────────────────

  it('asignar bodegas: el usuario solo ve las suyas', async () => {
    await request(app.getHttpServer())
      .patch(`/api/access/users/${cajeroId}`)
      .set(auth(adminToken))
      .send({ warehouseIds: [warehouseAId] })
      .expect(200);

    const res = await request(app.getHttpServer())
      .get('/api/inventory/warehouses')
      .set(auth(cajeroToken))
      .expect(200);

    const ids = res.body.map((w: { id: string }) => w.id);
    expect(ids).toEqual([warehouseAId]);
  });

  it('y no puede vender contra una bodega ajena aunque mande el id por la API', async () => {
    // Filtrar solo el desplegable no sirve de nada: la petición se puede armar
    // a mano. Esto es lo que cierra el hueco.
    const res = await request(app.getHttpServer())
      .post('/api/pos/sales')
      .set(auth(cajeroToken))
      .send({
        warehouseId: warehouseBId,
        items: [{ variantId, quantity: 1 }],
        payments: [
          { method: 'EFECTIVO', amount: 30000, receivedAmount: 30000 },
        ],
      })
      .expect(403);
    expect(res.body.message).toContain('No tienes acceso a la bodega');
  });

  it('tampoco puede tocar lo que PERTENECE a una bodega ajena', async () => {
    // El hueco que cerró `WarehouseScopeGuard`: aquí la petición **no nombra la
    // bodega**, nombra un traslado / conteo / compra que vive en ella.
    //
    // Se usa un Jefe de Bodega limitado a la bodega A, no el Cajero: el Cajero
    // sería rechazado antes por permisos y el test no probaría nada del guard de
    // bodegas. Este rol SÍ puede recibir traslados, cerrar conteos y recibir
    // compras — pero solo en su bodega.
    const rolJefe = await request(app.getHttpServer())
      .post('/api/access/roles')
      .set(auth(adminToken))
      .send({ name: `Jefe A ${suffix}`, templateKey: 'jefe-bodega' })
      .expect(201);

    const jefeEmail = `e2e-jefe-${suffix}@test.co`;
    const jefePass = 'jefe1234567';
    const jefe = await request(app.getHttpServer())
      .post('/api/users')
      .set(auth(adminToken))
      .send({
        email: jefeEmail,
        password: jefePass,
        firstName: 'E2E',
        lastName: 'Jefe',
        role: 'COLABORADOR',
      })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/access/users/${jefe.body.id}`)
      .set(auth(adminToken))
      .send({ accessRoleId: rolJefe.body.id, warehouseIds: [warehouseAId] })
      .expect(200);
    const jefeToken = await login(jefeEmail, jefePass);

    // Nota: el caso de "recibir un traslado" no se prueba aquí a propósito.
    // Necesitaría activar `transferConfirmationEnabled`, que es un ajuste de la
    // tienda **compartido** con la suite de traslados: las dos corriendo en
    // paralelo se pisarían y una fallaría sin motivo aparente. Que la
    // declaración de esa ruta mire la bodega destino (y la de anular, la de
    // origen) lo cubre `warehouse-scope.spec.ts`.

    // ── Conteo físico de la bodega ajena: no puede cerrarlo ─────────────────
    const conteo = await request(app.getHttpServer())
      .post('/api/inventory-counts')
      .set(auth(adminToken))
      .send({ warehouseId: warehouseBId })
      .expect(201);

    const cerrar = await request(app.getHttpServer())
      .post(`/api/inventory-counts/${conteo.body.id}/close`)
      .set(auth(jefeToken))
      .send({ adjust: false })
      .expect(403);
    expect(cerrar.body.message).toContain('cerrar este conteo');

    // ── Compra dirigida a la bodega ajena: no puede recibirla ───────────────
    const proveedor = await request(app.getHttpServer())
      .post('/api/suppliers')
      .set(auth(adminToken))
      .send({ name: `Prov Acc ${suffix}`, nit: `ACC-${suffix}` })
      .expect(201);

    const compra = await request(app.getHttpServer())
      .post('/api/purchases')
      .set(auth(adminToken))
      .send({
        supplierId: proveedor.body.id,
        warehouseId: warehouseBId,
        items: [{ variantId, quantityOrdered: 2, unitCost: 5000 }],
        paymentDueDate: '2026-12-31',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/purchases/${compra.body.id}/send`)
      .set(auth(adminToken))
      .expect(201);

    const recibirCompra = await request(app.getHttpServer())
      .post(`/api/purchases/${compra.body.id}/receive`)
      .set(auth(jefeToken))
      .expect(403);
    expect(recibirCompra.body.message).toContain('recibir esta compra');

    // Limpieza: el rol no se puede borrar mientras lo use alguien.
    await request(app.getHttpServer())
      .patch(`/api/access/users/${jefe.body.id}`)
      .set(auth(adminToken))
      .send({ accessRoleId: null })
      .expect(200);
    await request(app.getHttpServer())
      .delete(`/api/access/roles/${rolJefe.body.id}`)
      .set(auth(adminToken))
      .expect(200);
  });

  it('ni consultar el detalle de una bodega ajena por su id', async () => {
    // La ruta es `/inventory/warehouses/:id`: el parámetro no se llama
    // `warehouseId`, así que hay que reconocerlo por la ruta.
    const propia = await request(app.getHttpServer())
      .get(`/api/inventory/warehouses/${warehouseAId}`)
      .set(auth(cajeroToken))
      .expect(200);
    expect(propia.body.id).toBe(warehouseAId);

    const ajena = await request(app.getHttpServer())
      .get(`/api/inventory/warehouses/${warehouseBId}`)
      .set(auth(cajeroToken))
      .expect(403);
    expect(ajena.body.message).toContain('No tienes acceso a la bodega');
  });

  it('el costo de la mercancía no viaja si no puede ver Productos', async () => {
    // El Cajero necesita buscar qué vender, pero no tiene por qué saber en
    // cuánto se compró. Y esto no depende del endpoint: lo aplica el
    // interceptor para toda la aplicación.
    const busqueda = await request(app.getHttpServer())
      .get('/api/products/search?q=E2E Acc Producto')
      .set(auth(cajeroToken))
      .expect(200);

    expect(busqueda.body.length).toBeGreaterThan(0);
    for (const v of busqueda.body) {
      expect(v.product).toBeDefined();
      expect(v.product.name).toBeTruthy();
      expect(v.product.basePrice).toBeDefined();
      expect('costPrice' in v.product).toBe(false);
    }

    // El inventario que sí puede ver tampoco trae costo.
    const stock = await request(app.getHttpServer())
      .get(`/api/inventory/stock/variant/${variantId}`)
      .set(auth(cajeroToken))
      .expect(200);
    expect(JSON.stringify(stock.body)).not.toContain('costPrice');

    // Y el administrador sí lo ve: no se le rompió nada a quien sí puede.
    const comoAdmin = await request(app.getHttpServer())
      .get('/api/products/search?q=E2E Acc Producto')
      .set(auth(adminToken))
      .expect(200);
    expect(comoAdmin.body[0].product.costPrice).toBeDefined();
  });

  it('quitar las bodegas devuelve el acceso a todas', async () => {
    await request(app.getHttpServer())
      .patch(`/api/access/users/${cajeroId}`)
      .set(auth(adminToken))
      .send({ warehouseIds: [] })
      .expect(200);

    const res = await request(app.getHttpServer())
      .get('/api/inventory/warehouses')
      .set(auth(cajeroToken))
      .expect(200);
    const ids = res.body.map((w: { id: string }) => w.id);
    expect(ids).toContain(warehouseAId);
    expect(ids).toContain(warehouseBId);
  });

  // ── Editar la matriz en caliente ──────────────────────────────────────────

  it('cambiar la matriz cambia lo que el usuario puede hacer, sin volver a entrar', async () => {
    const rol = await request(app.getHttpServer())
      .get(`/api/access/roles/${cajeroRoleId}`)
      .set(auth(adminToken))
      .expect(200);

    const permissions = rol.body.permissions.map(
      (p: { module: string; list: boolean }) =>
        p.module === 'products' ? { ...p, list: true } : p,
    );

    await request(app.getHttpServer())
      .patch(`/api/access/roles/${cajeroRoleId}`)
      .set(auth(adminToken))
      .send({ permissions })
      .expect(200);

    // Mismo token de antes: el permiso se resuelve en cada petición.
    await request(app.getHttpServer())
      .get('/api/products')
      .set(auth(cajeroToken))
      .expect(200);
  });

  it('quitar un permiso se aplica en la siguiente petición, sin esperar nada', async () => {
    // Los permisos no se cachean: el momento en que se le quita un permiso a
    // alguien es normalmente el momento en que hace falta que se aplique.
    const rol = await request(app.getHttpServer())
      .get(`/api/access/roles/${cajeroRoleId}`)
      .set(auth(adminToken))
      .expect(200);

    // En el test anterior se le dio Ver en Productos; aquí se le quita.
    const sinProductos = rol.body.permissions.map((p: { module: string }) =>
      p.module === 'products'
        ? {
            module: 'products',
            list: false,
            create: false,
            edit: false,
            delete: false,
          }
        : p,
    );

    await request(app.getHttpServer())
      .patch(`/api/access/roles/${cajeroRoleId}`)
      .set(auth(adminToken))
      .send({ permissions: sinProductos })
      .expect(200);

    // Mismo token, petición inmediata: ya no pasa.
    await request(app.getHttpServer())
      .get('/api/products')
      .set(auth(cajeroToken))
      .expect(403);
  });

  it('no se puede borrar un rol que alguien esté usando', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/access/roles/${cajeroRoleId}`)
      .set(auth(adminToken))
      .expect(409);
    expect(res.body.message).toContain('1 usuario');
  });

  it('quitar el rol al usuario lo devuelve al comportamiento de antes', async () => {
    await request(app.getHttpServer())
      .patch(`/api/access/users/${cajeroId}`)
      .set(auth(adminToken))
      .send({ accessRoleId: null })
      .expect(200);

    const me = await request(app.getHttpServer())
      .get('/api/access/me')
      .set(auth(cajeroToken))
      .expect(200);
    expect(me.body.unrestricted).toBe(true);

    // Y ahora sí se puede borrar el rol, que quedó sin usuarios.
    await request(app.getHttpServer())
      .delete(`/api/access/roles/${cajeroRoleId}`)
      .set(auth(adminToken))
      .expect(200);
  });
});
