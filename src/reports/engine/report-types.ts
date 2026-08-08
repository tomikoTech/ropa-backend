/**
 * Contrato del motor de reportes (F9).
 *
 * La idea es una sola: un reporte **se declara**, no se programa dos veces.
 * Cada reporte devuelve sus columnas junto con sus filas, así que la misma
 * definición sirve para la tabla en pantalla, el Excel y el CSV. Por eso el
 * frontend no conoce ningún reporte en particular: pinta lo que llega.
 *
 * Eso es lo que reemplaza las 35 páginas casi iguales del sistema anterior.
 */

/**
 * Fila tal como sale de Postgres.
 *
 * `getRawMany()` devuelve `any[]`, y con `any` se pierde toda la ayuda del
 * compilador justo donde más hace falta (nombres de alias escritos a mano).
 * Tipar la fila así deja los valores en lo que de verdad pueden ser.
 */
export type RawRow = Record<string, string | number | boolean | null>;

/** Cómo se muestra y se alinea una columna (y cómo se formatea al exportar). */
export type ReportColumnType =
  | 'text'
  | 'number'
  | 'money'
  | 'percent'
  | 'date'
  | 'datetime';

export interface ReportColumn {
  key: string;
  label: string;
  type: ReportColumnType;
  /** Aclaración corta para el encabezado (qué significa la columna). */
  hint?: string;
}

/** Tarjeta de total en la cabecera del reporte. */
export interface ReportTotal {
  key: string;
  label: string;
  type: ReportColumnType;
  value: number | string;
  /** Aviso pegado al total (ej. "12 líneas sin costo registrado"). */
  hint?: string;
}

/**
 * Catálogos que el frontend necesita para llenar los desplegables.
 * Todos son listas cortas (decenas de filas), por eso van en una sola llamada.
 * Los clientes NO están: pueden ser miles, se filtran por texto.
 */
export type ReportOptionSource =
  | 'warehouses'
  | 'users'
  | 'categories'
  | 'brands'
  | 'sizes'
  | 'colors'
  | 'banks'
  | 'suppliers'
  | 'paymentMethods'
  | 'saleChannels';

export interface ReportOption {
  value: string;
  label: string;
}

/**
 * Un filtro puede aplicar solo a ciertos modos del reporte (el banco solo
 * tiene sentido en Cartera → Bancos). El frontend esconde los que no aplican,
 * en vez de mostrar campos que no hacen nada — que es de lo que más se queja
 * quien usa el sistema anterior.
 */
export interface ReportFilterScope {
  key: string;
  values: string[];
}

interface ReportFilterBase {
  key: string;
  label: string;
  appliesTo?: ReportFilterScope;
}

export type ReportFilterDef = ReportFilterBase &
  (
    | { kind: 'dateRange' }
    /** Opciones fijas, conocidas al declarar el reporte (modos, agrupaciones). */
    | {
        kind: 'select';
        options: ReportOption[];
        /** `true` = siempre hay uno elegido, no existe "todas". */
        fixed?: boolean;
        placeholder?: string;
      }
    /** Opciones que salen de la base (bodegas, usuarios, marcas…). */
    | {
        kind: 'lookup';
        source: ReportOptionSource;
        placeholder?: string;
      }
    | { kind: 'text'; placeholder?: string }
    | { kind: 'toggle' }
  );

export interface ReportDefinition {
  key: string;
  label: string;
  /** Agrupador para el menú ("Inventario", "Ventas", "Finanzas"). */
  group: string;
  description: string;
  /** Qué reportes del sistema anterior absorbe. Se muestra en la ficha. */
  absorbs: string[];
  /** Advertencias de lectura (qué NO incluye el número). */
  notes?: string[];
  filters: ReportFilterDef[];
  /** Valores iniciales de los filtros (los `fixed` deben tener uno). */
  defaults?: Record<string, string>;
}

/** Filtros ya normalizados que recibe cada reporte. */
export interface ReportQuery {
  /** Rango de fechas resuelto (siempre presente en los reportes con fecha). */
  from?: string;
  to?: string;
  /** Todo lo demás, tal como llegó (ya recortado y sin "ALL"). */
  params: Record<string, string>;
  /** `true` cuando el filtro está en ese valor. */
  flag(key: string): boolean;
  /** Valor de un select con default garantizado. */
  pick<T extends string>(key: string, allowed: readonly T[], fallback: T): T;
  /** UUID validado, o undefined. No lanza: un id basura simplemente no filtra. */
  uuid(key: string): string | undefined;
  /** Texto de búsqueda normalizado (minúsculas, sin espacios sobrantes). */
  text(key: string): string | undefined;
}

export interface ReportResult {
  columns: ReportColumn[];
  rows: Record<string, string | number | null>[];
  totals: ReportTotal[];
  /** Título con el que se nombra el archivo exportado. */
  title: string;
  /**
   * Avisos para el usuario: por qué un número puede no ser el que espera
   * (recorte de filas, líneas sin costo, módulos que aún no existen).
   */
  warnings?: string[];
}
