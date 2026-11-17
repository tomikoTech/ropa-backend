import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { setupTestApp, teardownTestApp } from './helpers/setup';
import { ModeloDeLenguaje } from '../src/assistant/modelo-de-lenguaje';

/**
 * El asistente con herramientas: «pregúntale y te lo entrega en tablas».
 *
 * Se prueba con una tienda nueva para que los totales sean exactos, y con el
 * modelo simulado: lo que importa aquí es lo que hace el servidor con lo que
 * pide el modelo —traducir nombres a ids, respetar la tienda, el permiso de
 * Reportes y las bodegas del usuario, y entregar la tabla sin que el modelo
 * toque los números—.
 */
describe('Asistente con herramientas (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  const ts = Date.now();
  let token: string;
  let tokenLimitado: string;
  let centroId: string;
  let norteId: string;
  const nombreCentro = `E2E Centro ${ts}`;
  const nombreNorte = `E2E Norte ${ts}`;
  const http = () => request(app.getHttpServer());
  const auth = (t = token) => ({ Authorization: `Bearer ${t}` });

  const crearUsuario = async (tenantId: string, correo: string) => {
    await ds.query(
      `INSERT INTO users (tenant_id, email, username, password_hash, first_name, last_name, role, is_active)
       VALUES ($1, $2, $3, $4, 'Ana', 'E2E', 'ADMIN', true)`,
      [
        tenantId,
        correo,
        correo.split('@')[0].slice(-20),
        await bcrypt.hash('asistente-e2e', 10),
      ],
    );
    const r = await http()
      .post('/api/auth/login')
      .send({ email: correo, password: 'asistente-e2e' })
      .expect(201);
    return (r.body.accessToken ?? r.body.data?.accessToken) as string;
  };

  beforeAll(async () => {
    app = await setupTestApp();
    ds = app.get(DataSource);
    const [tenant]: { id: string }[] = await ds.query(
      `INSERT INTO tenants (name, slug, is_active) VALUES ($1, $2, true) RETURNING id`,
      [`E2E Asistente ${ts}`, `e2e-asistente-${ts}`],
    );
    token = await crearUsuario(tenant.id, `asis-admin-${ts}@e2e.co`);

    const bodega = async (name: string) =>
      (
        await http()
          .post('/api/inventory/warehouses')
          .set(auth())
          .send({ name, isPosLocation: true })
          .expect(201)
      ).body.id as string;
    centroId = await bodega(nombreCentro);
    norteId = await bodega(nombreNorte);

    const prod = await http()
      .post('/api/products')
      .set(auth())
      .send({
        name: `E2E Tenis ${ts}`,
        basePrice: 100000,
        costPrice: 60000,
        taxRate: 0,
        variants: [
          { size: '38', color: 'Negro' },
          { size: '39', color: 'Negro' },
        ],
      })
      .expect(201);
    const [v38, v39] = prod.body.variants as { id: string; size: string }[];
    for (const v of [v38, v39]) {
      for (const warehouseId of [centroId, norteId]) {
        await http()
          .post('/api/inventory/adjust')
          .set(auth())
          .send({
            variantId: v.id,
            warehouseId,
            quantity: 10,
            movementType: 'IN',
            notes: 'E2E',
          })
          .expect(201);
      }
    }

    const cliente = async (firstName: string) =>
      (
        await http()
          .post('/api/clients')
          .set(auth())
          .send({
            firstName,
            lastName: `E2E ${ts}`,
            documentNumber: `${firstName}-${ts}`,
          })
          .expect(201)
      ).body.id as string;
    const qatar = await cliente('Qatar');
    const fabio = await cliente('Fabio');

    // Qatar: 3 de la 38 en el Centro, de contado. Fabio: 2 de la 39 en el
    // Norte, a crédito, y esa cuenta se deja vencida.
    await http()
      .post('/api/pos/sales')
      .set(auth())
      .send({
        warehouseId: centroId,
        clientId: qatar,
        applyTax: false,
        items: [{ variantId: v38.id, quantity: 3 }],
        payments: [
          { method: 'EFECTIVO', amount: 300000, receivedAmount: 300000 },
        ],
      })
      .expect(201);
    const credito = await http()
      .post('/api/pos/sales')
      .set(auth())
      .send({
        warehouseId: norteId,
        clientId: fabio,
        applyTax: false,
        items: [{ variantId: v39.id, quantity: 2 }],
        payments: [{ method: 'CREDITO', amount: 200000 }],
        creditDueDate: '2026-12-31',
      })
      .expect(201);
    await ds.query(
      `UPDATE accounts_receivable SET due_date = '2026-01-15' WHERE sale_id = $1`,
      [credito.body.id],
    );

    // Un usuario sin Reportes, y otro con Reportes pero solo la bodega Norte.
    const correoLimitado = `asis-norte-${ts}@e2e.co`;
    tokenLimitado = await crearUsuario(tenant.id, correoLimitado);
    const [limitado]: { id: string }[] = await ds.query(
      `SELECT id FROM users WHERE email = $1`,
      [correoLimitado],
    );
    const rol = await http()
      .post('/api/access/roles')
      .set(auth())
      .send({
        name: `Solo Norte ${ts}`,
        permissions: [{ module: 'reports', list: true }],
      })
      .expect(201);
    await http()
      .patch(`/api/access/users/${limitado.id}`)
      .set(auth())
      .send({ accessRoleId: rol.body.id, warehouseIds: [norteId] })
      .expect(200);
  }, 180000);

  afterAll(async () => {
    jest.restoreAllMocks();
    await teardownTestApp();
  });

  const consulta = (body: object, t = token) =>
    http().post('/api/assistant/consulta').set(auth(t)).send(body);

  it('ventas por cliente: la tabla sale del reporte, con totales exactos y columnas que se tocan', async () => {
    const r = await consulta({
      herramienta: 'ventas',
      argumentos: { agrupar_por: 'cliente' },
    }).expect(201);
    const filas = r.body.filas as {
      grupo: string;
      unidades: number;
      total: number;
    }[];
    expect(filas.map((f) => [f.grupo, f.unidades])).toEqual([
      [`Qatar E2E ${ts}`, 3],
      [`Fabio E2E ${ts}`, 2],
    ]);
    expect(
      r.body.columnas.find((c: { key: string }) => c.key === 'grupo').clicable,
    ).toBe(true);
    expect(
      r.body.totales.find((t: { key: string }) => t.key === 'unidades').value,
    ).toBe(5);
  });

  it('el clic en un cliente trae sus ventas, línea por línea', async () => {
    const r = await consulta({
      herramienta: 'ventas',
      argumentos: { agrupar_por: 'cliente' },
      clic: { columna: 'grupo', valor: `Qatar E2E ${ts}` },
    }).expect(201);
    expect(r.body.argumentos).toMatchObject({
      agrupar_por: 'linea',
      buscar: `Qatar E2E ${ts}`,
    });
    expect(r.body.filas).toHaveLength(1);
    expect(r.body.filas[0]).toMatchObject({ talla: '38', cantidad: 3 });
  });

  it('filtra por talla y por bodega por nombre', async () => {
    const r = await consulta({
      herramienta: 'inventario',
      argumentos: { talla: '39', bodega: 'norte' },
    }).expect(201);
    expect(r.body.filas).toHaveLength(1);
    // 10 que entraron menos las 2 de Fabio.
    expect(r.body.filas[0]).toMatchObject({
      talla: '39',
      bodega: nombreNorte,
      cantidad: 8,
    });
    expect(r.body.filtros.map((f: { valor: string }) => f.valor)).toEqual(
      expect.arrayContaining(['39', nombreNorte]),
    );
  });

  it('una talla que no existe contesta cuáles hay, en vez de traer todo', async () => {
    const r = await consulta({
      herramienta: 'inventario',
      argumentos: { talla: '44' },
    }).expect(400);
    expect(r.body.message).toMatch(/38.*39/);
  });

  it('cartera: quién me debe vencido, agrupado por cliente y desde siempre', async () => {
    const r = await consulta({
      herramienta: 'cartera',
      argumentos: { agrupar_por: 'cliente', solo_vencidas: true },
    }).expect(201);
    expect(r.body.filas).toEqual([
      expect.objectContaining({
        cliente: `Fabio E2E ${ts}`,
        facturas: 1,
        saldo: 200000,
        vencido: 200000,
      }),
    ]);
    expect(r.body.filtros).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          parametro: 'desde',
          valor: 'siempre',
          porDefecto: true,
        }),
      ]),
    );
  });

  it('el usuario con una sola bodega solo ve esa, aunque no la pida', async () => {
    const r = await consulta(
      { herramienta: 'ventas', argumentos: { agrupar_por: 'bodega' } },
      tokenLimitado,
    ).expect(201);
    expect(r.body.filas.map((f: { grupo: string }) => f.grupo)).toEqual([
      nombreNorte,
    ]);
    // Y no puede pedir la otra: ni siquiera sabe que existe.
    const otra = await consulta(
      { herramienta: 'inventario', argumentos: { bodega: nombreCentro } },
      tokenLimitado,
    ).expect(400);
    expect(otra.body.message).toContain(`Las que hay: ${nombreNorte}.`);
  });

  it('sin permiso de Reportes no consulta', async () => {
    const rol = await http()
      .post('/api/access/roles')
      .set(auth())
      .send({
        name: `Sin reportes ${ts}`,
        permissions: [{ module: 'sales', list: true }],
      })
      .expect(201);
    const [u]: { id: string }[] = await ds.query(
      `SELECT id FROM users WHERE email = $1`,
      [`asis-norte-${ts}@e2e.co`],
    );
    await http()
      .patch(`/api/access/users/${u.id}`)
      .set(auth())
      .send({ accessRoleId: rol.body.id })
      .expect(200);
    await consulta(
      { herramienta: 'ventas', argumentos: {} },
      tokenLimitado,
    ).expect(403);
  });

  it('el chat: el modelo pide la herramienta por nombre y la tabla llega sin que él copie números', async () => {
    const modelo = app.get(ModeloDeLenguaje);
    const espia = jest
      .spyOn(modelo, 'completar')
      // 1) Se equivoca de talla; 2) se corrige con lo que le respondieron; 3) resume.
      .mockResolvedValueOnce({
        content: null,
        tool_calls: [
          {
            id: 'c1',
            type: 'function',
            function: { name: 'inventario', arguments: '{"talla":"44"}' },
          },
        ],
      })
      .mockResolvedValueOnce({
        content: null,
        tool_calls: [
          {
            id: 'c2',
            type: 'function',
            function: { name: 'inventario', arguments: '{"talla":"38"}' },
          },
        ],
      })
      .mockResolvedValueOnce({
        content: 'De la 38 te quedan 17 pares.',
        tool_calls: undefined,
      });

    const r = await http()
      .post('/api/assistant/chat')
      .set(auth())
      .send({
        messages: [{ role: 'user', content: '¿Cuántas de la 44 me quedan?' }],
      })
      .expect(201);

    expect(r.body.reply).toBe('De la 38 te quedan 17 pares.');
    // Solo la consulta que funcionó se vuelve tabla.
    expect(r.body.tablas).toHaveLength(1);
    expect(r.body.tablas[0].filtros).toEqual([
      expect.objectContaining({ etiqueta: 'Talla', valor: '38' }),
    ]);
    expect(r.body.nota).toMatch(/Consulté inventario con Talla: 38/);

    // Al modelo le llegó el error con las tallas que hay, y luego el resumen.
    const segunda = espia.mock.calls[1][0];
    const errorDeTalla = segunda.find((m) => m.role === 'tool');
    expect(
      errorDeTalla && 'content' in errorDeTalla && errorDeTalla.content,
    ).toMatch(/38, 39/);
    // Las herramientas viajaron en la primera llamada.
    const herramientas = espia.mock.calls[0][1] as {
      function: { name: string };
    }[];
    expect(herramientas.map((t) => t.function.name)).toEqual(
      expect.arrayContaining(['ventas', 'inventario', 'cartera']),
    );
  });
});
