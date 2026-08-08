import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { setupTestApp, loginAsAdmin, teardownTestApp } from './helpers/setup';

/**
 * F9 — motor de reportes.
 *
 * Lo importante de esta suite: **ejecuta cada consulta de cada reporte contra
 * Postgres de verdad**. Un reporte roto no falla al compilar, falla cuando el
 * dueño lo abre; aquí se recorren los seis reportes con todos sus modos y
 * agrupaciones (33 consultas distintas).
 *
 * Además comprueba la aritmética con ventas creadas a propósito: costo,
 * utilidad y margen; una venta regalada por debajo del costo y otra por encima
 * del precio de lista (para el control de precios); y que "hasta hoy" incluya
 * lo de hoy.
 */
describe('Reportes parametrizables (e2e)', () => {
  let app: INestApplication;
  let token: string;
  const suffix = Date.now();

  let variantId: string;
  let warehouseId: string;
  let saleNumber: string;
  // Ventas hechas a propósito para el reporte de control de precios.
  let saleBajoNumber: string; // por debajo del precio y del costo, con descuento
  let saleAltoNumber: string; // por encima del precio

  const auth = () => ({ Authorization: `Bearer ${token}` });
  const today = (): string => {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  };

  // 3 unidades a 20.000 con costo de 12.000. El IVA lo pone la configuración
  // de la tienda (el `taxRate` del producto no manda), así que el test verifica
  // las relaciones entre las columnas y no una cifra de IVA fija.
  const PRICE = 20000;
  const COST = 12000;
  const QTY = 3;

  // Venta "regalada": 8.000 con 20% más de descuento = 6.400 la unidad, por
  // debajo del precio de lista Y por debajo del costo.
  const BAJO_PRICE = 8000;
  const BAJO_DISCOUNT = 20;
  const BAJO_QTY = 2;
  const BAJO_NET_UNIT = BAJO_PRICE * (1 - BAJO_DISCOUNT / 100);
  // Venta por encima del precio de lista.
  const ALTO_PRICE = 30000;
  const ALTO_QTY = 1;
  const VENDIDO_TOTAL = QTY + BAJO_QTY + ALTO_QTY;

  beforeAll(async () => {
    app = await setupTestApp();
    token = await loginAsAdmin(app);

    const product = await request(app.getHttpServer())
      .post('/api/products')
      .set(auth())
      .send({
        name: `E2E Reporte ${suffix}`,
        basePrice: PRICE,
        costPrice: COST,
        taxRate: 0,
        brand: `MarcaReporte${suffix}`,
        variants: [{ size: '41', color: 'Verde reporte' }],
      })
      .expect(201);
    variantId = product.body.variants[0].id;

    const wh = await request(app.getHttpServer())
      .post('/api/inventory/warehouses')
      .set(auth())
      .send({
        name: `E2E Rep WH ${suffix}`,
        code: `REP-${suffix}`,
        isPosLocation: true,
      })
      .expect(201);
    warehouseId = wh.body.id;

    await request(app.getHttpServer())
      .post('/api/inventory/adjust')
      .set(auth())
      .send({
        variantId,
        warehouseId,
        quantity: 20,
        movementType: 'IN',
        notes: 'Stock inicial del reporte',
      })
      .expect(201);

    const sale = await request(app.getHttpServer())
      .post('/api/pos/sales')
      .set(auth())
      .send({
        warehouseId,
        items: [{ variantId, quantity: QTY }],
        payments: [
          {
            method: 'EFECTIVO',
            amount: PRICE * QTY,
            receivedAmount: PRICE * QTY,
          },
        ],
      })
      .expect(201);
    saleNumber = sale.body.saleNumber;

    // `applyTax: false` deja el IVA en 0 para que las diferencias del reporte
    // de precios se puedan comprobar con aritmética a mano.
    const bajo = await request(app.getHttpServer())
      .post('/api/pos/sales')
      .set(auth())
      .send({
        warehouseId,
        applyTax: false,
        items: [
          {
            variantId,
            quantity: BAJO_QTY,
            unitPrice: BAJO_PRICE,
            discountPercent: BAJO_DISCOUNT,
          },
        ],
        payments: [
          {
            method: 'EFECTIVO',
            amount: BAJO_NET_UNIT * BAJO_QTY,
            receivedAmount: BAJO_NET_UNIT * BAJO_QTY,
          },
        ],
      })
      .expect(201);
    saleBajoNumber = bajo.body.saleNumber;

    const alto = await request(app.getHttpServer())
      .post('/api/pos/sales')
      .set(auth())
      .send({
        warehouseId,
        applyTax: false,
        items: [{ variantId, quantity: ALTO_QTY, unitPrice: ALTO_PRICE }],
        payments: [
          {
            method: 'EFECTIVO',
            amount: ALTO_PRICE * ALTO_QTY,
            receivedAmount: ALTO_PRICE * ALTO_QTY,
          },
        ],
      })
      .expect(201);
    saleAltoNumber = alto.body.saleNumber;
  }, 90000);

  afterAll(async () => {
    await teardownTestApp();
  });

  // ── Catálogo y opciones ───────────────────────────────────────────────────

  it('GET /reports/catalog → los seis reportes, con lo que absorben y lo que no', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/reports/catalog')
      .set(auth())
      .expect(200);

    const keys = res.body.reports.map((r: { key: string }) => r.key);
    expect(keys).toEqual([
      'inventario',
      'valorizacion',
      'utilidad',
      'control-precios',
      'cartera',
      'movimientos',
    ]);

    for (const report of res.body.reports) {
      expect(report.label).toBeTruthy();
      expect(report.description).toBeTruthy();
      expect(Array.isArray(report.filters)).toBe(true);
      expect(report.absorbs.length).toBeGreaterThan(0);
      // Todo select "fijo" tiene que traer su valor inicial, o la pantalla
      // abriría sin modo elegido.
      for (const f of report.filters) {
        if (f.kind === 'select' && f.fixed) {
          expect(report.defaults?.[f.key]).toBeTruthy();
        }
      }
    }

    // Los reportes que NO se pueden replicar se declaran con su motivo, en vez
    // de dar a entender que la paridad es total.
    expect(res.body.uncovered.length).toBeGreaterThan(0);
    for (const u of res.body.uncovered) {
      expect(u.name).toBeTruthy();
      expect(u.reason).toBeTruthy();
    }
  });

  it('GET /reports/options → catálogos para los desplegables', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/reports/options')
      .set(auth())
      .expect(200);

    for (const key of [
      'warehouses',
      'users',
      'categories',
      'brands',
      'sizes',
      'colors',
      'banks',
      'suppliers',
      'paymentMethods',
      'saleChannels',
    ]) {
      expect(Array.isArray(res.body[key])).toBe(true);
    }
    expect(
      res.body.warehouses.some(
        (w: { id: string; value: string }) => w.value === warehouseId,
      ),
    ).toBe(true);
    expect(res.body.paymentMethods.length).toBeGreaterThan(0);
  });

  it('GET /reports/run/:key con una clave que no existe → 404 que dice cuáles hay', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/reports/run/no-existe')
      .set(auth())
      .expect(404);
    expect(res.body.message).toContain('inventario');
  });

  // ── Cada modo de cada reporte, contra la base real ────────────────────────

  const combos: { key: string; params: string; nombre: string }[] = [
    ...[
      'variante',
      'producto',
      'bodega',
      'categoria',
      'marca',
      'ubicacion',
    ].map((g) => ({
      key: 'inventario',
      params: `groupBy=${g}`,
      nombre: `inventario/${g}`,
    })),
    ...['existencias', 'ingresos'].map((m) => ({
      key: 'valorizacion',
      params: `mode=${m}`,
      nombre: `valorizacion/${m}`,
    })),
    ...[
      'linea',
      'venta',
      'dia',
      'vendedor',
      'producto',
      'categoria',
      'marca',
      'bodega',
    ].map((g) => ({
      key: 'utilidad',
      params: `groupBy=${g}`,
      nombre: `utilidad/${g}`,
    })),
    ...['debajo', 'encima', 'perdida', 'descuentos'].flatMap((m) =>
      ['base', 'mayorista'].map((ref) => ({
        key: 'control-precios',
        params: `mode=${m}&reference=${ref}`,
        nombre: `control-precios/${m}/${ref}`,
      })),
    ),
    ...['cobrar', 'pagar', 'bancos'].map((m) => ({
      key: 'cartera',
      params: `mode=${m}`,
      nombre: `cartera/${m}`,
    })),
    ...[
      'ajustes',
      'traslados',
      'devoluciones',
      'conteos',
      'consignaciones',
      'bonos',
    ].map((m) => ({
      key: 'movimientos',
      params: `mode=${m}`,
      nombre: `movimientos/${m}`,
    })),
  ];

  it.each(combos)(
    'GET /reports/run/$key ($nombre) responde con columnas, filas y totales',
    async ({ key, params }) => {
      const res = await request(app.getHttpServer())
        .get(`/api/reports/run/${key}?${params}&from=2020-01-01&to=${today()}`)
        .set(auth())
        .expect(200);

      expect(Array.isArray(res.body.columns)).toBe(true);
      expect(res.body.columns.length).toBeGreaterThan(0);
      expect(Array.isArray(res.body.rows)).toBe(true);
      expect(Array.isArray(res.body.totals)).toBe(true);
      expect(res.body.title).toBeTruthy();

      // Toda columna declarada tiene tipo conocido, y toda fila trae
      // exactamente las claves de las columnas (si no, la tabla saldría con
      // celdas vacías sin que nadie sepa por qué).
      const tipos = ['text', 'number', 'money', 'percent', 'date', 'datetime'];
      for (const col of res.body.columns) {
        expect(tipos).toContain(col.type);
      }
      const claves = res.body.columns.map((c: { key: string }) => c.key);
      for (const row of res.body.rows.slice(0, 5)) {
        for (const clave of claves) {
          expect(Object.prototype.hasOwnProperty.call(row, clave)).toBe(true);
        }
      }
    },
    30000,
  );

  // ── Aritmética verificable ───────────────────────────────────────────────

  it('utilidad: costo, utilidad y margen salen de la venta creada', async () => {
    const res = await request(app.getHttpServer())
      .get(
        `/api/reports/run/utilidad?groupBy=linea&from=${today()}&to=${today()}` +
          `&warehouseId=${warehouseId}`,
      )
      .set(auth())
      .expect(200);

    const fila = res.body.rows.find(
      (r: { venta: string }) => r.venta === saleNumber,
    );
    expect(fila).toBeDefined();
    expect(fila.cantidad).toBe(QTY);
    expect(fila.total).toBe(PRICE * QTY);

    // El IVA lo decide la configuración de la tienda (tasa y si va incluido en
    // el precio), no el reporte. Lo que el reporte tiene que cumplir siempre:
    // la venta sin IVA es el total menos el IVA, y la utilidad se calcula
    // sobre esa base y no sobre el total con IVA.
    expect(fila.neta).toBeCloseTo(fila.total - fila.iva, 2);

    // El costo viene del snapshot de la línea, no del producto de hoy.
    expect(fila.costoUnit).toBe(COST);
    expect(fila.costo).toBe(COST * QTY);
    expect(fila.utilidad).toBeCloseTo(fila.neta - COST * QTY, 2);
    expect(fila.margen).toBeCloseTo(
      Math.round((fila.utilidad / fila.neta) * 10000) / 100,
      2,
    );
    // Y la utilidad tiene que ser MENOR que comparar contra el total con IVA:
    // es justo el error que se quería evitar.
    expect(fila.utilidad).toBeLessThanOrEqual(fila.total - COST * QTY);
  });

  it('el filtro "hasta hoy" incluye las ventas de hoy', async () => {
    // Antes el límite superior se comparaba contra las 00:00 del día, así que
    // el reporte del día salía vacío hasta el día siguiente.
    const res = await request(app.getHttpServer())
      .get(
        `/api/reports/run/utilidad?groupBy=venta&from=${today()}&to=${today()}`,
      )
      .set(auth())
      .expect(200);

    const ventas = res.body.rows.map((r: { grupo: string }) => r.grupo);
    expect(ventas).toContain(saleNumber);

    const totalVentas = res.body.totals.find(
      (t: { key: string }) => t.key === 'ventas',
    );
    expect(Number(totalVentas.value)).toBeGreaterThan(0);
  });

  it('los totales no dependen de las filas que se muestran', async () => {
    // El total de "Vendido" agrupando por día tiene que coincidir con el de
    // agrupar por producto: son la misma plata contada de otra forma.
    const [porDia, porProducto] = await Promise.all(
      ['dia', 'producto'].map((g) =>
        request(app.getHttpServer())
          .get(
            `/api/reports/run/utilidad?groupBy=${g}&from=2020-01-01&to=${today()}`,
          )
          .set(auth())
          .expect(200),
      ),
    );

    const vendido = (res: {
      body: { totals: { key: string; value: number }[] };
    }) => res.body.totals.find((t) => t.key === 'venta')?.value;
    expect(vendido(porDia)).toBe(vendido(porProducto));
  });

  it('el inventario cuadra: la referencia queda con lo que no se vendió', async () => {
    const res = await request(app.getHttpServer())
      .get(
        `/api/reports/run/inventario?groupBy=variante&warehouseId=${warehouseId}`,
      )
      .set(auth())
      .expect(200);

    const fila = res.body.rows.find(
      (r: { talla: string; color: string }) =>
        r.talla === '41' && r.color === 'Verde reporte',
    );
    expect(fila).toBeDefined();
    const quedan = 20 - VENDIDO_TOTAL;
    expect(fila.cantidad).toBe(quedan);
    expect(fila.costoUnit).toBe(COST);
    expect(fila.valorCosto).toBe(COST * quedan);
    expect(fila.valorVenta).toBe(PRICE * quedan);
  });

  // ── Control de precios, con las ventas hechas a propósito ────────────────

  const controlPrecios = async (mode: string) => {
    const res = await request(app.getHttpServer())
      .get(
        `/api/reports/run/control-precios?mode=${mode}&reference=base` +
          `&from=${today()}&to=${today()}&warehouseId=${warehouseId}`,
      )
      .set(auth())
      .expect(200);
    return res.body;
  };

  it('control de precios: detecta lo vendido por debajo del precio de lista', async () => {
    const body = await controlPrecios('debajo');
    const fila = body.rows.find(
      (r: { venta: string }) => r.venta === saleBajoNumber,
    );
    expect(fila).toBeDefined();
    expect(fila.referencia).toBe(PRICE);
    expect(fila.precioCobrado).toBe(BAJO_NET_UNIT);
    expect(fila.difUnit).toBe(BAJO_NET_UNIT - PRICE);
    expect(fila.difTotal).toBe((BAJO_NET_UNIT - PRICE) * BAJO_QTY);
    // Y la venta a precio normal NO puede aparecer aquí.
    expect(
      body.rows.some((r: { venta: string }) => r.venta === saleNumber),
    ).toBe(false);
    // El reporte avisa que compara contra el precio de hoy.
    expect(body.warnings.join(' ')).toContain('precio de HOY');
  });

  it('control de precios: detecta lo vendido por encima', async () => {
    const body = await controlPrecios('encima');
    const fila = body.rows.find(
      (r: { venta: string }) => r.venta === saleAltoNumber,
    );
    expect(fila).toBeDefined();
    expect(fila.difUnit).toBe(ALTO_PRICE - PRICE);
    expect(
      body.rows.some((r: { venta: string }) => r.venta === saleBajoNumber),
    ).toBe(false);
  });

  it('control de precios: detecta la venta por debajo del costo', async () => {
    const body = await controlPrecios('perdida');
    const fila = body.rows.find(
      (r: { venta: string }) => r.venta === saleBajoNumber,
    );
    expect(fila).toBeDefined();
    // 6.400 × 2 cobrados contra 12.000 × 2 de costo.
    expect(fila.neta).toBe(BAJO_NET_UNIT * BAJO_QTY);
    expect(fila.utilidad).toBe(BAJO_NET_UNIT * BAJO_QTY - COST * BAJO_QTY);
    expect(fila.utilidad).toBeLessThan(0);
    // La venta por encima del precio no dio pérdida.
    expect(
      body.rows.some((r: { venta: string }) => r.venta === saleAltoNumber),
    ).toBe(false);
  });

  it('control de precios: lista las líneas con descuento y no las demás', async () => {
    const body = await controlPrecios('descuentos');
    const fila = body.rows.find(
      (r: { venta: string }) => r.venta === saleBajoNumber,
    );
    expect(fila).toBeDefined();
    expect(fila.descuento).toBe(BAJO_DISCOUNT);
    expect(
      body.rows.some((r: { venta: string }) => r.venta === saleAltoNumber),
    ).toBe(false);
  });

  it('un rango de fechas al revés se endereza y se avisa', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/reports/run/utilidad?from=2026-03-01&to=2026-01-01')
      .set(auth())
      .expect(200);
    expect(res.body.warnings.join(' ')).toContain('intercambiaron');
  });

  it('un uuid basura en un filtro no revienta la consulta', async () => {
    // Un `= :id` con texto no-uuid contra una columna uuid es un 22P02 de
    // Postgres, que llegaría como error 500.
    await request(app.getHttpServer())
      .get('/api/reports/run/inventario?warehouseId=no-soy-uuid')
      .set(auth())
      .expect(200);
  });

  // ── Exportación ──────────────────────────────────────────────────────────

  it('exporta el mismo reporte a Excel y a CSV', async () => {
    const xlsx = await request(app.getHttpServer())
      .get(
        `/api/reports/run/utilidad/export?format=xlsx&from=${today()}&to=${today()}`,
      )
      .set(auth())
      .buffer()
      .expect(200);
    expect(xlsx.headers['content-type']).toContain('spreadsheet');
    expect(xlsx.headers['content-disposition']).toContain('.xlsx');
    const bytes = Buffer.isBuffer(xlsx.body)
      ? xlsx.body.length
      : (xlsx.text?.length ?? 0);
    expect(bytes).toBeGreaterThan(1000);

    const csv = await request(app.getHttpServer())
      .get(
        `/api/reports/run/utilidad/export?format=csv&from=${today()}&to=${today()}`,
      )
      .set(auth())
      .expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain('Producto');
  }, 30000);

  it('un formato de exportación desconocido se rechaza con un mensaje claro', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/reports/run/utilidad/export?format=pdf')
      .set(auth())
      .expect(400);
    expect(res.body.message).toContain('xlsx');
  });
});
