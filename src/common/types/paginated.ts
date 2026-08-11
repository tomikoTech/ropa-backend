/**
 * Forma de una respuesta paginada.
 *
 * Es la que ya devuelve el catálogo (`products.findPaginated`), y se repite
 * aquí para que todas las pantallas lean el total de la misma manera en vez de
 * inventarse un formato por módulo.
 */
export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
