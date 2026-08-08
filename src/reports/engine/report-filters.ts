/**
 * Normalización de los filtros que llegan por querystring y construcción de
 * los límites de fecha. Todo aquí es **puro**: entra texto, sale un objeto.
 *
 * Dos decisiones que importan más de lo que parecen:
 *
 * 1. **El `hasta` incluye su día completo.** Un filtro `hasta=2026-08-07`
 *    comparado contra un `timestamptz` da las 00:00 de ese día, así que las
 *    ventas de la jornada quedaban fuera del reporte. Aquí el límite superior
 *    es el día siguiente, exclusivo.
 *
 * 2. **El día se corta en la zona del negocio, no en UTC.** El servidor corre
 *    en UTC; una venta de las 8 de la noche en Colombia es de la 1 de la
 *    mañana del día siguiente en UTC. Sin esto, un cierre diario mete las
 *    ventas de la tarde en el día equivocado.
 */

import type { ReportQuery } from './report-types.js';

/**
 * Zona con la que se cortan los días de los reportes. Todos los clientes son
 * colombianos; se puede cambiar por entorno sin recompilar.
 */
export const REPORT_TZ = process.env.REPORTS_TZ?.trim() || 'America/Bogota';

/** Nombre de zona seguro para interpolar en SQL (solo letras, /, _, -, +). */
function safeTz(tz: string): string {
  return /^[A-Za-z0-9/_+-]+$/.test(tz) ? tz : 'America/Bogota';
}

const TZ = safeTz(REPORT_TZ);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** yyyy-mm-dd en hora local (no UTC, para no desfasar el día). */
function isoLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export interface ResolvedRange {
  from: string;
  to: string;
  warnings: string[];
}

/**
 * Rango de fechas usable siempre: si no viene, es el mes en curso; si viene al
 * revés, se endereza **avisando** (no en silencio, que es lo que hace que
 * alguien lea un total y no entienda de dónde salió).
 */
export function resolveRange(
  from?: string,
  to?: string,
  now: Date = new Date(),
): ResolvedRange {
  const warnings: string[] = [];
  const validFrom = from && ISO_DATE.test(from) ? from : undefined;
  const validTo = to && ISO_DATE.test(to) ? to : undefined;

  if (from && !validFrom) warnings.push(`Fecha "desde" inválida: ${from}`);
  if (to && !validTo) warnings.push(`Fecha "hasta" inválida: ${to}`);

  const monthStart = isoLocal(new Date(now.getFullYear(), now.getMonth(), 1));
  const today = isoLocal(now);

  let start = validFrom ?? monthStart;
  let end = validTo ?? today;

  if (start > end) {
    warnings.push(
      `El "desde" (${start}) era posterior al "hasta" (${end}); se intercambiaron.`,
    );
    [start, end] = [end, start];
  }

  return { from: start, to: end, warnings };
}

/**
 * Condición para una columna `timestamptz`: desde las 00:00 del día `from`
 * hasta el final del día `to`, en la zona del negocio.
 *
 * Usa los parámetros `:from` y `:to` — hay que pasarlos al QueryBuilder.
 */
export function timestampRangeSql(column: string): string {
  return (
    `${column} >= ((:from)::timestamp AT TIME ZONE '${TZ}')` +
    ` AND ${column} < (((:to)::date + 1)::timestamp AT TIME ZONE '${TZ}')`
  );
}

/**
 * Condición para una columna `timestamp` **sin** zona.
 *
 * Solo hay una así en el modelo (`accounts_payable_payments.created_at`, que
 * quedó sin `timestamptz` cuando se creó). Se compara su reloj tal como está
 * guardado, sin inventar una conversión: no se sabe con qué zona se escribió.
 * El efecto práctico es que un abono registrado de noche puede caer en el día
 * vecino; para todo lo demás usamos `timestampRangeSql`.
 */
export function naiveTimestampRangeSql(column: string): string {
  return (
    `${column} >= (:from)::timestamp` +
    ` AND ${column} < ((:to)::date + 1)::timestamp`
  );
}

/** Día (yyyy-mm-dd) de una columna `timestamp` sin zona. */
export function naiveDaySql(column: string): string {
  return `to_char(${column}, 'YYYY-MM-DD')`;
}

/** Condición para una columna `date` (no lleva hora: se compara tal cual). */
export function dateRangeSql(column: string): string {
  return `${column} >= (:from)::date AND ${column} <= (:to)::date`;
}

/** Día local (yyyy-mm-dd) de una columna `timestamptz`, para agrupar. */
export function localDaySql(column: string): string {
  return `to_char(${column} AT TIME ZONE '${TZ}', 'YYYY-MM-DD')`;
}

/** Fecha y hora local legible de una columna `timestamptz`. */
export function localDateTimeSql(column: string): string {
  return `to_char(${column} AT TIME ZONE '${TZ}', 'YYYY-MM-DD HH24:MI')`;
}

/**
 * Limpia lo que llega por querystring: recorta espacios y descarta los valores
 * que significan "sin filtro" (`ALL` es lo que manda el select del frontend).
 */
export function normalizeParams(
  raw: Record<string, unknown>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value == null) continue;
    // Un array llega cuando el mismo filtro viene repetido; se toma el último.
    const flat = Array.isArray(value) ? value[value.length - 1] : value;
    if (typeof flat !== 'string' && typeof flat !== 'number') continue;
    const clean = String(flat).trim();
    if (!clean || clean === 'ALL') continue;
    out[key] = clean;
  }
  return out;
}

/** Empaqueta los filtros ya normalizados con los accesores del contrato. */
export function buildReportQuery(
  raw: Record<string, unknown>,
  now: Date = new Date(),
): ReportQuery & { warnings: string[] } {
  const params = normalizeParams(raw);
  const range = resolveRange(params.from, params.to, now);

  return {
    from: range.from,
    to: range.to,
    params,
    warnings: range.warnings,
    flag(key: string): boolean {
      const v = params[key]?.toLowerCase();
      return v === 'true' || v === '1' || v === 'si' || v === 'sí';
    },
    pick<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
      const v = params[key] as T | undefined;
      return v && allowed.includes(v) ? v : fallback;
    },
    uuid(key: string): string | undefined {
      const v = params[key];
      return v && UUID.test(v) ? v : undefined;
    },
    text(key: string): string | undefined {
      const v = params[key];
      const clean = v?.replace(/\s+/g, ' ').trim();
      return clean ? clean : undefined;
    },
  };
}

// ── Aritmética de los reportes ──────────────────────────────────────────────

/** Redondeo a pesos con 2 decimales, sin el ruido binario del float. */
export function money(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

/**
 * Texto de una celda cruda, con reemplazo cuando viene nula o vacía.
 *
 * Existe para no repetir `String(x ?? '—')` en cada columna: el tipo de la
 * fila cruda admite booleanos y números, y `String()` sobre eso deja al linter
 * (con razón) avisando de posibles "[object Object]".
 */
export function str(
  value: string | number | boolean | null | undefined,
  fallback = '',
): string {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
}

/** Entero seguro (lo que devuelve Postgres en un SUM viene como texto). */
export function int(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

/**
 * Margen en porcentaje sobre la venta. Si no se vendió nada devuelve 0: un
 * margen "infinito" no se puede leer, y `NaN` rompe el Excel.
 */
export function marginPct(profit: number, revenue: number): number {
  if (!revenue) return 0;
  return Math.round((profit / revenue) * 10000) / 100;
}
