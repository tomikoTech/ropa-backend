import {
  armarTabla,
  buscarHerramienta,
  buscarOpcion,
  DESDE_SIEMPRE,
  esquemaDeHerramienta,
  HERRAMIENTAS,
  MAX_FILAS_MODELO,
  refinar,
  resumenParaElModelo,
  traducirArgumentos,
  type Herramienta,
} from './herramientas';
import type { ReportResult } from '../reports/engine/report-types';

const h = (nombre: string): Herramienta => {
  const x = buscarHerramienta(nombre);
  if (!x) throw new Error(nombre);
  return x;
};

const opciones = {
  sizes: [
    { value: 'id-38', label: '38' },
    { value: 'id-39', label: '39' },
    { value: 'id-m', label: 'M' },
  ],
  colors: [
    { value: 'id-negro', label: 'Negro' },
    { value: 'id-azul', label: 'Azul oscuro' },
    { value: 'id-azul-c', label: 'Azul claro' },
  ],
  warehouses: [
    { value: 'id-centro', label: 'Local Centro' },
    { value: 'id-bodega', label: 'Bodega Principal' },
  ],
  users: [{ value: 'id-ana', label: 'Ana Gómez' }],
  categories: [{ value: 'id-cat', label: 'Lociones' }],
};

describe('las herramientas del asistente', () => {
  it('cada una apunta a un reporte que existe y arma su esquema', () => {
    expect(HERRAMIENTAS.length).toBeGreaterThanOrEqual(3);
    expect(HERRAMIENTAS.length).toBeLessThanOrEqual(5);
    for (const x of HERRAMIENTAS) {
      const e = esquemaDeHerramienta(x);
      expect(e.function.name).toBe(x.nombre);
      expect(
        Object.keys(e.function.parameters.properties).length,
      ).toBeGreaterThan(0);
    }
  });

  it('los filtros salen del reporte, con nombres que el modelo entiende', () => {
    const props = esquemaDeHerramienta(h('inventario')).function.parameters
      .properties;
    expect(Object.keys(props)).toEqual(
      expect.arrayContaining([
        'talla',
        'color',
        'bodega',
        'agrupar_por',
        'solo_bajo_minimo',
      ]),
    );
    // Lo que el modelo no puede mandar no se ofrece.
    expect(props).not.toHaveProperty('sizeId');
    expect(props.agrupar_por.enum).toContain('variante');
    // Ventas ganó talla y color.
    const ventas = esquemaDeHerramienta(h('ventas')).function.parameters
      .properties;
    expect(Object.keys(ventas)).toEqual(
      expect.arrayContaining([
        'desde',
        'hasta',
        'buscar',
        'talla',
        'color',
        'vendedor',
      ]),
    );
  });
});

describe('buscarOpcion', () => {
  it('exacto gana, sin tildes ni mayúsculas', () => {
    expect(buscarOpcion('ana gomez', opciones.users)).toEqual({
      ok: true,
      opcion: opciones.users[0],
    });
  });

  it('una coincidencia parcial única sirve', () => {
    const r = buscarOpcion('centro', opciones.warehouses);
    expect(r.ok && r.opcion.value).toBe('id-centro');
  });

  it('si son varias, no escoge al azar', () => {
    const r = buscarOpcion('azul', opciones.colors);
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(r.candidatos.map((c) => c.label)).toEqual([
        'Azul oscuro',
        'Azul claro',
      ]);
  });
});

describe('traducirArgumentos', () => {
  it('los nombres pasan a ids y quedan los nombres para mostrar', () => {
    const r = traducirArgumentos(
      h('inventario'),
      { talla: '38', color: 'negro', bodega: 'centro', solo_bajo_minimo: true },
      opciones,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.params).toMatchObject({
      sizeId: 'id-38',
      colorId: 'id-negro',
      warehouseId: 'id-centro',
      onlyLowStock: 'true',
    });
    expect(r.filtros.map((f) => `${f.etiqueta}: ${f.valor}`)).toEqual(
      expect.arrayContaining([
        'Talla: 38',
        'Color: Negro',
        'Bodega: Local Centro',
      ]),
    );
  });

  it('una talla que no existe responde cuáles hay, para que el modelo se corrija', () => {
    const r = traducirArgumentos(h('inventario'), { talla: '44' }, opciones);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/38, 39, M/);
  });

  it('un filtro que la herramienta no tiene se rechaza diciendo cuáles tiene', () => {
    const r = traducirArgumentos(h('cartera'), { talla: '38' }, opciones);
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(r.error).toMatch(/no tiene el filtro talla.*solo_vencidas/);
  });

  it('cartera trae por defecto lo que se debe desde siempre, y lo marca', () => {
    const r = traducirArgumentos(h('cartera'), {}, opciones);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.params).toMatchObject({
      from: DESDE_SIEMPRE,
      mode: 'cobrar',
      onlyOpen: 'true',
    });
    expect(r.filtros.find((f) => f.parametro === 'desde')).toMatchObject({
      valor: 'siempre',
      porDefecto: true,
    });
  });

  it('la cartera de clientes sale por cliente, y el clic baja a sus facturas', () => {
    const r = traducirArgumentos(h('cartera'), {}, opciones);
    expect(r.ok && r.params.groupBy).toBe('cliente');
    if (!r.ok) return;
    const clic = refinar(h('cartera'), r.argumentos, 'cliente', 'Fabio');
    expect(clic.ok && clic.argumentos).toMatchObject({
      agrupar_por: 'factura',
      buscar: 'Fabio',
    });
  });

  it('un defecto que no aplica al modo se cae: proveedores no se agrupan por cliente', () => {
    const r = traducirArgumentos(h('cartera'), { ver: 'pagar' }, opciones);
    expect(r.ok && r.params).not.toHaveProperty('groupBy');
    expect(r.ok && r.filtros.map((f) => f.parametro)).not.toContain(
      'agrupar_por',
    );
  });

  it('lo que manda el modelo gana sobre el defecto', () => {
    const r = traducirArgumentos(
      h('cartera'),
      { ver: 'pagar', desde: '2026-10-01' },
      opciones,
    );
    expect(r.ok && r.params).toMatchObject({
      mode: 'pagar',
      from: '2026-10-01',
    });
  });

  it('acepta el valor o la etiqueta de una lista, y una fecha mal escrita se rechaza', () => {
    const r = traducirArgumentos(
      h('ventas'),
      { agrupar_por: 'Cliente' },
      opciones,
    );
    expect(r.ok && r.params.groupBy).toBe('cliente');
    const f = traducirArgumentos(h('ventas'), { desde: '1/10/2026' }, opciones);
    expect(f.ok).toBe(false);
  });

  it('los vacíos no cuentan como filtro', () => {
    const r = traducirArgumentos(
      h('inventario'),
      { talla: '', color: null },
      opciones,
    );
    expect(r.ok && r.params).toEqual({});
  });
});

describe('refinar (el clic en una celda)', () => {
  it('en ventas por cliente, el clic filtra por ese cliente y baja al detalle', () => {
    const r = refinar(
      h('ventas'),
      { agrupar_por: 'cliente', desde: '2026-10-01' },
      'grupo',
      'Qatar Local',
    );
    expect(r).toEqual({
      ok: true,
      argumentos: {
        agrupar_por: 'linea',
        desde: '2026-10-01',
        buscar: 'Qatar Local',
      },
    });
  });

  it('en ventas por día, el clic deja solo ese día', () => {
    const r = refinar(
      h('ventas'),
      { agrupar_por: 'dia' },
      'grupo',
      '2026-10-05',
    );
    expect(r.ok && r.argumentos).toMatchObject({
      desde: '2026-10-05',
      hasta: '2026-10-05',
      agrupar_por: 'linea',
    });
  });

  it('en el detalle, el clic en una talla suma el filtro sin cambiar el agrupador', () => {
    const r = refinar(
      h('inventario'),
      { agrupar_por: 'variante' },
      'talla',
      '38',
    );
    expect(r.ok && r.argumentos).toEqual({
      agrupar_por: 'variante',
      talla: '38',
    });
  });

  it('no filtra por «sin cliente» ni por columnas que la herramienta no tiene', () => {
    expect(
      refinar(h('ventas'), { agrupar_por: 'cliente' }, 'grupo', 'Sin cliente')
        .ok,
    ).toBe(false);
    expect(refinar(h('cartera'), {}, 'vendedor', 'Ana').ok).toBe(false);
  });
});

describe('la tabla y lo que ve el modelo', () => {
  const resultado: ReportResult = {
    title: 'Ventas por cliente',
    columns: [
      { key: 'grupo', label: 'Cliente', type: 'text' },
      { key: 'total', label: 'Vendido', type: 'money' },
    ],
    rows: Array.from({ length: 45 }, (_, i) => ({
      grupo: `Cliente ${i}`,
      total: 1000 * i,
    })),
    totals: [{ key: 'venta', label: 'Vendido', type: 'money', value: 990000 }],
    warnings: [],
  };
  const t = traducirArgumentos(
    h('ventas'),
    { agrupar_por: 'cliente' },
    opciones,
  );

  it('marca qué columnas se pueden tocar', () => {
    if (!t.ok) throw new Error('traducción');
    const tabla = armarTabla(h('ventas'), t, resultado);
    expect(tabla.columnas.find((c) => c.key === 'grupo')?.clicable).toBe(true);
    expect(tabla.columnas.find((c) => c.key === 'total')?.clicable).toBe(false);
    expect(tabla.totalFilas).toBe(45);
  });

  it('el modelo ve los totales exactos y solo las primeras filas', () => {
    if (!t.ok) throw new Error('traducción');
    const resumen = JSON.parse(
      resumenParaElModelo(armarTabla(h('ventas'), t, resultado)),
    ) as {
      totales: Record<string, number>;
      filas: unknown[][];
      nota?: string;
    };
    expect(resumen.totales).toEqual({ Vendido: 990000 });
    expect(resumen.filas).toHaveLength(MAX_FILAS_MODELO);
    expect(resumen.filas[1]).toEqual(['Cliente 1', 1000]);
    expect(resumen.nota).toMatch(/tabla completa/);
  });
});
