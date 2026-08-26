import { Paginated } from '../types/paginated.js';
import { parsePositiveInt } from './query-number.util.js';

/**
 * El cálculo de página que comparten todos los listados.
 *
 * Existía disperso: cada servicio recortaba el `limit` y calculaba el `offset`
 * y las `totalPages` a su manera —cuando lo hacía—. Centralizarlo es lo que
 * hace que «paginado» signifique lo mismo en Existencias, en Ventas y en
 * Cartera, y que ningún `?limit=` de la URL pueda pedir la tabla entera.
 *
 * El **resumen** viaja aparte a propósito: son los agregados de TODO el filtro
 * (unidades, referencias, cuánto hay bajo mínimo), no de la página. Se calculan
 * con su propia consulta —un `SUM`/`COUNT` sobre el conjunto completo— y se
 * cuelgan del paginado para que las tarjetas y el pie no cuenten solo lo que se
 * ve. Contar sobre la página es el error clásico: «3 referencias» cuando en
 * realidad hay 300.
 */

/** Lo que el llamador necesita para consultar: qué traer y desde dónde. */
export interface Pagina {
  page: number;
  limit: number;
  offset: number;
}

/** Los topes de cada listado. El máximo evita que la URL pida de más. */
export interface ConfigDePagina {
  limitDefault: number;
  limitMax: number;
}

export function resolverPagina(
  opts: { page?: string | number | null; limit?: string | number | null },
  cfg: ConfigDePagina,
): Pagina {
  const page = parsePositiveInt(opts.page) ?? 1;
  const limit = parsePositiveInt(opts.limit, { max: cfg.limitMax }) ?? cfg.limitDefault;
  return { page, limit, offset: (page - 1) * limit };
}

/**
 * Arma la respuesta paginada. `total` es el número de filas de TODO el filtro
 * (de ahí salen las páginas), no las de `data`. `resumen`, si se pasa, son los
 * agregados del conjunto completo.
 */
export function armarPaginado<T, R>(
  data: T[],
  total: number,
  pagina: Pick<Pagina, 'page' | 'limit'>,
  resumen?: R,
): Paginated<T> & { resumen?: R } {
  const base: Paginated<T> = {
    data,
    total,
    page: pagina.page,
    limit: pagina.limit,
    totalPages: total === 0 ? 0 : Math.ceil(total / pagina.limit),
  };
  // Sin resumen no se mete la llave: `resumen: undefined` se lee distinto de
  // «este listado no trae resumen» al inspeccionar la respuesta.
  return resumen === undefined ? base : { ...base, resumen };
}
