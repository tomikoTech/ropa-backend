/**
 * Las herramientas del asistente: con qué consulta los datos de la tienda.
 *
 * **No hay consultas propias.** Cada herramienta es un reporte del motor de
 * reportes (`src/reports/engine/`), que ya está probado, respeta la tienda y
 * calcula los totales bien. Lo que el asistente añade es la traducción:
 *
 * - Los filtros de la herramienta **salen de la definición del reporte**. Si
 *   el reporte gana un filtro, el asistente lo puede usar sin tocar nada aquí.
 * - El modelo filtra **por nombre** («talla 38», «bodega Centro»), nunca por
 *   id. Aquí se traduce el nombre al id, y si no existe se le responde cuáles
 *   hay: así el modelo se corrige solo en vez de inventar.
 * - El clic en una celda de la tabla es otra consulta con un filtro más, y
 *   la decide esta tabla, no el modelo: es inmediata y no cuesta nada.
 *
 * Todo esto es puro, sin base de datos ni red.
 */

import { findReportDefinition } from '../reports/engine/report-catalog.js';
import type {
  ReportColumn,
  ReportDefinition,
  ReportFilterDef,
  ReportOption,
  ReportOptionSource,
  ReportResult,
  ReportTotal,
} from '../reports/engine/report-types.js';

export interface Herramienta {
  /** Nombre que ve el modelo. */
  nombre: string;
  /** Clave del reporte que la respalda. */
  reporte: string;
  descripcion: string;
  /** Argumentos que se ponen solos si el modelo no los manda. */
  porDefecto?: Record<string, string | boolean>;
}

/**
 * «Siempre», para la cartera: lo que se debe no depende de cuándo se facturó,
 * y el reporte filtra por fecha de factura con el mes en curso por defecto.
 */
export const DESDE_SIEMPRE = '2000-01-01';

export const HERRAMIENTAS: Herramienta[] = [
  {
    nombre: 'ventas',
    reporte: 'utilidad',
    descripcion:
      'Ventas completadas de un período: unidades, vendido, costo y utilidad. ' +
      'Se agrupa por cliente, producto, vendedor, día, venta, categoría, ' +
      'marca, bodega, talla o color. Para «cuánto vendí», «qué se vende más», ' +
      '«cuánto le vendí a X», «unidades por cliente».',
  },
  {
    nombre: 'inventario',
    reporte: 'inventario',
    descripcion:
      'Existencias de hoy: qué hay, en qué bodega y cuánto vale. Se filtra ' +
      'por producto, talla, color, bodega, categoría o marca, y se pueden ' +
      'pedir solo los que están por debajo del mínimo.',
  },
  {
    nombre: 'cartera',
    reporte: 'cartera',
    descripcion:
      'Lo que deben los clientes (ver=cobrar), lo que se les debe a los ' +
      'proveedores (ver=pagar) y el movimiento de plata por banco ' +
      '(ver=bancos). Por defecto trae todo lo que sigue debiéndose, sin ' +
      'importar cuándo se facturó. Para «quién me debe», agrupa por cliente.',
    // «¿Quién me debe?» se responde con una fila por cliente; tocar el
    // cliente baja a sus facturas.
    porDefecto: {
      ver: 'cobrar',
      desde: DESDE_SIEMPRE,
      solo_con_saldo: true,
      agrupar_por: 'cliente',
    },
  },
  {
    nombre: 'movimientos',
    reporte: 'movimientos',
    descripcion:
      'Lo que se movió en el inventario en un período: ajustes y bajas, ' +
      'traslados entre bodegas, devoluciones de venta, conteos físicos, ' +
      'ventas de terceros, despachos y bonos.',
  },
  {
    nombre: 'precios',
    reporte: 'control-precios',
    descripcion:
      'Ventas con descuento, vendidas por debajo o por encima del precio, o ' +
      'por debajo del costo.',
  },
];

export function buscarHerramienta(nombre: string): Herramienta | undefined {
  return HERRAMIENTAS.find((h) => h.nombre === nombre);
}

function definicionDe(h: Herramienta): ReportDefinition {
  const def = findReportDefinition(h.reporte);
  // Una herramienta que apunta a un reporte que no existe es un error de
  // programación, y lo atrapa la prueba de este archivo.
  if (!def) throw new Error(`La herramienta ${h.nombre} no tiene reporte`);
  return def;
}

// ── Nombres de los filtros ────────────────────────────────────────────────

/** Cómo se llama cada filtro del reporte para el modelo. */
const NOMBRE_DEL_FILTRO: Record<string, string> = {
  search: 'buscar',
  groupBy: 'agrupar_por',
  mode: 'ver',
  warehouseId: 'bodega',
  categoryId: 'categoria',
  brand: 'marca',
  sizeId: 'talla',
  colorId: 'color',
  channel: 'canal',
  status: 'estado',
  reference: 'comparar_contra',
  onlyOpen: 'solo_con_saldo',
  onlyOverdue: 'solo_vencidas',
  includeZero: 'incluir_en_cero',
  onlyLowStock: 'solo_bajo_minimo',
  bankId: 'banco',
  method: 'forma_de_pago',
  supplierId: 'proveedor',
};

/** Sin tildes, en minúscula y con un solo espacio: para comparar nombres. */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * El nombre del parámetro. `userId` es «vendedor» en ventas y «usuario» en
 * movimientos: sale de la etiqueta del reporte, que ya lo dice bien.
 */
function nombreDe(f: ReportFilterDef): string {
  if (f.key === 'userId') return normalizar(f.label);
  return NOMBRE_DEL_FILTRO[f.key] ?? f.key;
}

interface Parametro {
  nombre: string;
  filtro: ReportFilterDef;
  /** En el período, cuál de las dos fechas es. */
  fecha?: 'from' | 'to';
}

function parametrosDe(def: ReportDefinition): Parametro[] {
  const lista: Parametro[] = [];
  for (const f of def.filters) {
    if (f.kind === 'dateRange') {
      lista.push({ nombre: 'desde', filtro: f, fecha: 'from' });
      lista.push({ nombre: 'hasta', filtro: f, fecha: 'to' });
    } else {
      lista.push({ nombre: nombreDe(f), filtro: f });
    }
  }
  return lista;
}

function cuandoAplica(f: ReportFilterDef): string {
  return f.appliesTo
    ? ` Solo aplica con ${NOMBRE_DEL_FILTRO[f.appliesTo.key] ?? f.appliesTo.key}=${f.appliesTo.values.join(' o ')}.`
    : '';
}

// ── Esquema para el modelo ─────────────────────────────────────────────────

/** Ejemplo de valores que se le muestran al modelo en la descripción. */
const EJEMPLO_POR_FUENTE: Partial<Record<ReportOptionSource, string>> = {
  sizes: 'ej. "38" o "M"',
  colors: 'ej. "negro"',
  warehouses: 'nombre de la bodega',
  users: 'nombre de la persona',
  categories: 'nombre de la categoría',
  brands: 'nombre de la marca',
  suppliers: 'nombre del proveedor',
  banks: 'nombre del banco',
};

/**
 * La herramienta en el formato de funciones de la API (compatible con
 * OpenAI, que es la que habla DeepSeek).
 */
export function esquemaDeHerramienta(h: Herramienta) {
  const def = definicionDe(h);
  const properties: Record<string, Record<string, unknown>> = {};

  for (const p of parametrosDe(def)) {
    const f = p.filtro;
    if (p.fecha) {
      properties[p.nombre] = {
        type: 'string',
        description:
          (p.fecha === 'from'
            ? 'Fecha inicial, AAAA-MM-DD.'
            : 'Fecha final, AAAA-MM-DD.') +
          ' Sin fechas se usa el mes en curso hasta hoy.',
      };
      continue;
    }
    if (f.kind === 'select') {
      properties[p.nombre] = {
        type: 'string',
        enum: f.options.map((o) => o.value),
        description:
          `${f.label}: ` +
          f.options.map((o) => `${o.value} = ${o.label}`).join('; ') +
          '.' +
          cuandoAplica(f),
      };
    } else if (f.kind === 'lookup') {
      properties[p.nombre] = {
        type: 'string',
        description:
          `${f.label}, por nombre (${EJEMPLO_POR_FUENTE[f.source] ?? 'texto'}). ` +
          'Si no existe, la respuesta trae los valores que hay.' +
          cuandoAplica(f),
      };
    } else if (f.kind === 'toggle') {
      properties[p.nombre] = {
        type: 'boolean',
        description: `${f.label}.${cuandoAplica(f)}`,
      };
    } else {
      properties[p.nombre] = {
        type: 'string',
        description: `${f.label}${f.kind === 'text' && f.placeholder ? ` (${f.placeholder})` : ''}.${cuandoAplica(f)}`,
      };
    }
  }

  return {
    type: 'function' as const,
    function: {
      name: h.nombre,
      description:
        h.descripcion +
        (def.notes?.length ? ` Ojo: ${def.notes.join(' ')}` : '') +
        ' Sin filtros trae todo.',
      parameters: {
        type: 'object',
        properties,
        additionalProperties: false,
      },
    },
  };
}

// ── De los argumentos del modelo a los parámetros del reporte ──────────────

export type Argumentos = Record<string, string | boolean | number | null>;

export interface FiltroAplicado {
  parametro: string;
  etiqueta: string;
  /** Lo que se muestra: el nombre, nunca el id. */
  valor: string;
  /** Lo puso el sistema, no el usuario. */
  porDefecto?: boolean;
}

export type Traduccion =
  | {
      ok: true;
      params: Record<string, string>;
      argumentos: Argumentos;
      filtros: FiltroAplicado[];
    }
  | { ok: false; error: string };

type Opciones = Partial<Record<ReportOptionSource, ReportOption[]>>;

const MAX_OPCIONES_EN_ERROR = 60;

function listar(opciones: ReportOption[]): string {
  const nombres = opciones.map((o) => o.label);
  const recorte = nombres.slice(0, MAX_OPCIONES_EN_ERROR).join(', ');
  return nombres.length > MAX_OPCIONES_EN_ERROR
    ? `${recorte} (y ${nombres.length - MAX_OPCIONES_EN_ERROR} más)`
    : recorte;
}

/**
 * El valor de una lista por nombre. Primero exacto, luego «empieza por», luego
 * «contiene». Si quedan varios, se pregunta: escoger uno al azar es como
 * contestar con datos de otra bodega.
 */
export function buscarOpcion(
  texto: string,
  opciones: ReportOption[],
):
  | { ok: true; opcion: ReportOption }
  | { ok: false; candidatos: ReportOption[] } {
  const q = normalizar(texto);
  const exacta = opciones.filter(
    (o) => normalizar(o.label) === q || normalizar(o.value) === q,
  );
  if (exacta.length === 1) return { ok: true, opcion: exacta[0] };
  const empieza = opciones.filter((o) => normalizar(o.label).startsWith(q));
  if (empieza.length === 1) return { ok: true, opcion: empieza[0] };
  const contiene = opciones.filter((o) => normalizar(o.label).includes(q));
  if (contiene.length === 1) return { ok: true, opcion: contiene[0] };
  return {
    ok: false,
    candidatos: exacta.length ? exacta : empieza.length ? empieza : contiene,
  };
}

function textoDe(v: unknown): string {
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return '';
}

function esVerdadero(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  const t = normalizar(textoDe(v));
  return t === 'true' || t === '1' || t === 'si';
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Los argumentos del modelo (por nombre) a los parámetros del reporte (por
 * id). Lo que no se puede traducir vuelve como error **con las opciones**,
 * que es lo que el modelo necesita para corregirse.
 */
export function traducirArgumentos(
  h: Herramienta,
  recibidos: Argumentos,
  opciones: Opciones,
): Traduccion {
  const def = definicionDe(h);
  const parametros = parametrosDe(def);
  const porNombre = new Map(parametros.map((p) => [p.nombre, p]));

  // Los vacíos no cuentan: el modelo a veces manda `"talla": ""`.
  const limpios: Argumentos = {};
  for (const [k, v] of Object.entries(recibidos ?? {})) {
    if (v === null || v === undefined || textoDe(v) === '') continue;
    limpios[k] = v;
  }

  const desconocidos = Object.keys(limpios).filter((k) => !porNombre.has(k));
  if (desconocidos.length) {
    return {
      ok: false,
      error:
        `La herramienta ${h.nombre} no tiene el filtro ${desconocidos.join(', ')}. ` +
        `Los que tiene: ${parametros.map((p) => p.nombre).join(', ')}.`,
    };
  }

  const argumentos: Argumentos = { ...limpios };
  const puestos = new Set<string>();
  for (const [k, v] of Object.entries(h.porDefecto ?? {})) {
    if (!(k in argumentos)) {
      argumentos[k] = v;
      puestos.add(k);
    }
  }
  // Un defecto que no aplica al modo elegido se cae: «agrupar por cliente»
  // no significa nada en la cartera de proveedores, y mostrarlo confunde.
  for (const k of puestos) {
    const scope = porNombre.get(k)?.filtro.appliesTo;
    if (!scope) continue;
    const nombreDelModo = NOMBRE_DEL_FILTRO[scope.key] ?? scope.key;
    if (!scope.values.includes(textoDe(argumentos[nombreDelModo]))) {
      delete argumentos[k];
      puestos.delete(k);
    }
  }

  const params: Record<string, string> = {};
  const filtros: FiltroAplicado[] = [];

  for (const [nombre, valor] of Object.entries(argumentos)) {
    const p = porNombre.get(nombre)!;
    const f = p.filtro;
    const texto = textoDe(valor);
    const porDefecto = puestos.has(nombre) || undefined;

    if (p.fecha) {
      if (!FECHA.test(texto)) {
        return {
          ok: false,
          error: `La fecha ${nombre} debe ir como AAAA-MM-DD; llegó «${texto}».`,
        };
      }
      params[p.fecha] = texto;
      filtros.push({
        parametro: nombre,
        etiqueta: nombre === 'desde' ? 'Desde' : 'Hasta',
        valor: texto === DESDE_SIEMPRE ? 'siempre' : texto,
        porDefecto,
      });
      continue;
    }

    if (f.kind === 'toggle') {
      if (!esVerdadero(valor)) continue;
      params[f.key] = 'true';
      filtros.push({
        parametro: nombre,
        etiqueta: f.label,
        valor: 'Sí',
        porDefecto,
      });
      continue;
    }

    if (f.kind === 'select') {
      const r = buscarOpcion(texto, f.options);
      if (!r.ok) {
        return {
          ok: false,
          error:
            `${f.label} no puede ser «${texto}». ` +
            `Valores: ${f.options.map((o) => `${o.value} (${o.label})`).join(', ')}.`,
        };
      }
      params[f.key] = r.opcion.value;
      filtros.push({
        parametro: nombre,
        etiqueta: f.label,
        valor: r.opcion.label,
        porDefecto,
      });
      continue;
    }

    if (f.kind === 'lookup') {
      const lista = opciones[f.source] ?? [];
      const r = buscarOpcion(texto, lista);
      if (!r.ok) {
        const etiqueta = f.label.toLowerCase();
        return {
          ok: false,
          error: r.candidatos.length
            ? `«${texto}» coincide con varias opciones de ${etiqueta}: ${listar(r.candidatos)}. Usa el nombre exacto.`
            : lista.length
              ? `No hay ${etiqueta} «${texto}». Las que hay: ${listar(lista)}.`
              : `Esta tienda no tiene ${etiqueta} registradas.`,
        };
      }
      params[f.key] = r.opcion.value;
      filtros.push({
        parametro: nombre,
        etiqueta: f.label,
        valor: r.opcion.label,
        porDefecto,
      });
      continue;
    }

    params[f.key] = texto;
    filtros.push({
      parametro: nombre,
      etiqueta: f.label,
      valor: texto,
      porDefecto,
    });
  }

  return { ok: true, params, argumentos, filtros };
}

// ── El clic en una celda ───────────────────────────────────────────────────

/** Qué filtro sale de cada columna de los reportes. */
const COLUMNA_A_PARAMETRO: Record<string, string> = {
  cliente: 'buscar',
  producto: 'buscar',
  venta: 'buscar',
  factura: 'buscar',
  proveedor: 'buscar',
  documento: 'buscar',
  sku: 'buscar',
  orden: 'buscar',
  vendedor: 'vendedor',
  usuario: 'usuario',
  bodega: 'bodega',
  categoria: 'categoria',
  marca: 'marca',
  talla: 'talla',
  color: 'color',
};

/** Valores que no son de nadie: filtrar por ellos no tiene sentido. */
const SIN_VALOR = /^(—|-|sin .+|consumidor final)?$/i;

function agrupadorDe(def: ReportDefinition) {
  const f = def.filters.find((x) => x.key === 'groupBy');
  return f && f.kind === 'select' ? f : undefined;
}

/** La columna `grupo` es la del agrupador: «cliente», «producto», «día»… */
function columnaReal(
  h: Herramienta,
  columna: string,
  argumentos: Argumentos,
): string {
  if (columna !== 'grupo') return columna;
  const agrupador = agrupadorDe(definicionDe(h));
  return textoDe(argumentos.agrupar_por) || agrupador?.options[0]?.value || '';
}

/** ¿La herramienta acepta este parámetro? */
export function tieneParametro(h: Herramienta, nombre: string): boolean {
  return parametrosDe(definicionDe(h)).some((p) => p.nombre === nombre);
}

/** ¿Hacer clic en esta columna filtra algo en esta herramienta? */
export function columnaClicable(
  h: Herramienta,
  columna: string,
  argumentos: Argumentos,
): boolean {
  const real = columnaReal(h, columna, argumentos);
  if (real === 'dia') return true;
  const parametro = COLUMNA_A_PARAMETRO[real];
  return !!parametro && tieneParametro(h, parametro);
}

/**
 * Los argumentos de la consulta siguiente al hacer clic en una celda: el
 * valor pasa a ser un filtro, y si la tabla estaba agrupada se baja al
 * detalle. Clic en «Qatar» dentro de ventas por cliente = las ventas de
 * Qatar, línea por línea.
 */
export function refinar(
  h: Herramienta,
  argumentos: Argumentos,
  columna: string,
  valor: string,
): { ok: true; argumentos: Argumentos } | { ok: false; error: string } {
  const limpio = valor.trim();
  if (SIN_VALOR.test(limpio)) {
    return {
      ok: false,
      error: 'Esa celda no tiene un valor por el cual filtrar.',
    };
  }
  if (!columnaClicable(h, columna, argumentos)) {
    return {
      ok: false,
      error: 'Esa columna no se puede usar como filtro aquí.',
    };
  }

  const real = columnaReal(h, columna, argumentos);
  const siguiente: Argumentos = { ...argumentos };

  if (real === 'dia') {
    if (!FECHA.test(limpio)) {
      return { ok: false, error: 'Esa celda no tiene una fecha válida.' };
    }
    siguiente.desde = limpio;
    siguiente.hasta = limpio;
  } else {
    siguiente[COLUMNA_A_PARAMETRO[real]] = limpio;
  }

  // Bajar al detalle: el primer agrupador es siempre el más fino (línea de
  // venta, referencia, factura).
  const agrupador = agrupadorDe(definicionDe(h));
  // La columna del agrupador es `grupo` en ventas e inventario, y la propia
  // (`cliente`) en la cartera por cliente.
  const esElGrupo =
    columna === 'grupo' || textoDe(argumentos.agrupar_por) === real;
  if (agrupador && esElGrupo) {
    siguiente.agrupar_por = agrupador.options[0].value;
  }
  return { ok: true, argumentos: siguiente };
}

// ── La tabla que se entrega ────────────────────────────────────────────────

/** Filas que viajan al navegador. Lo demás se pide acotando o en Reportes. */
export const MAX_FILAS_TABLA = 500;
/** Filas que ve el modelo: las suficientes para resumir, no para copiar. */
export const MAX_FILAS_MODELO = 30;

export interface ColumnaDeTabla extends ReportColumn {
  clicable: boolean;
}

export interface TablaDelAsistente {
  herramienta: string;
  titulo: string;
  argumentos: Argumentos;
  filtros: FiltroAplicado[];
  columnas: ColumnaDeTabla[];
  filas: Record<string, string | number | null>[];
  totalFilas: number;
  totales: ReportTotal[];
  avisos: string[];
}

export function armarTabla(
  h: Herramienta,
  traduccion: Extract<Traduccion, { ok: true }>,
  resultado: ReportResult,
): TablaDelAsistente {
  return {
    herramienta: h.nombre,
    titulo: resultado.title,
    argumentos: traduccion.argumentos,
    filtros: traduccion.filtros,
    columnas: resultado.columns.map((c) => ({
      ...c,
      clicable: columnaClicable(h, c.key, traduccion.argumentos),
    })),
    filas: resultado.rows.slice(0, MAX_FILAS_TABLA),
    totalFilas: resultado.rows.length,
    totales: resultado.totals,
    avisos: resultado.warnings ?? [],
  };
}

/**
 * Lo que el modelo lee de la tabla: totales exactos y las primeras filas como
 * listas (pesan la mitad que objetos). El usuario ve la tabla completa debajo
 * de la respuesta, así que el modelo no tiene que copiarla.
 */
export function resumenParaElModelo(t: TablaDelAsistente): string {
  return JSON.stringify({
    titulo: t.titulo,
    filtros: t.filtros.map((f) => `${f.etiqueta}: ${f.valor}`),
    totales: Object.fromEntries(t.totales.map((x) => [x.label, x.value])),
    totalFilas: t.totalFilas,
    columnas: t.columnas.map((c) => c.label),
    filas: t.filas
      .slice(0, MAX_FILAS_MODELO)
      .map((f) => t.columnas.map((c) => f[c.key] ?? null)),
    ...(t.totalFilas > MAX_FILAS_MODELO
      ? {
          nota: `Solo van las primeras ${MAX_FILAS_MODELO} filas; el usuario ve la tabla completa.`,
        }
      : {}),
    avisos: t.avisos,
  });
}
