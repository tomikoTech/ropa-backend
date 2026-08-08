/**
 * De dónde sale la bodega de una petición.
 *
 * La restricción por bodega (el `Userbodega` del sistema anterior) se aplicaba
 * endpoint por endpoint, y eso deja huecos por definición: el siguiente
 * endpoint que reciba una bodega se olvida. Aquí la pregunta "¿qué bodega está
 * tocando esta petición?" se responde en **un solo lugar**, de dos formas:
 *
 * 1. **Directa** — la bodega viene en la petición (cuerpo, ruta o query). Se
 *    detecta por el nombre del campo, así que cualquier endpoint nuevo que
 *    reciba un `warehouseId` queda cubierto sin tocar nada.
 * 2. **Indirecta** — la petición nombra algo que *pertenece* a una bodega
 *    (recibir un traslado, recibir una compra, cerrar un conteo). Eso no se
 *    puede deducir del nombre del campo: se declara en `ENTITY_WAREHOUSE_SOURCES`,
 *    una fila por ruta, visible y revisable de un vistazo.
 *
 * Archivo **puro**: no consulta la base ni conoce Nest.
 */

/** Campos que nombran una bodega, en cualquier capitalización o con guion bajo. */
const WAREHOUSE_FIELD = /(^|_)warehouse_?id$/i;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Tope de profundidad al recorrer el cuerpo de la petición. */
const MAX_DEPTH = 8;

function isWarehouseField(key: string): boolean {
  // `warehouseId`, `warehouse_id`, `fromWarehouseId`, `toWarehouseId`…
  return WAREHOUSE_FIELD.test(key.replace(/([a-z0-9])([A-Z])/g, '$1_$2'));
}

/**
 * Todas las bodegas nombradas en el cuerpo, la ruta y el query.
 *
 * Recorre en profundidad porque una bodega puede venir dentro de un arreglo de
 * ítems, no solo en la raíz.
 */
export function collectDirectWarehouseIds(sources: {
  params?: unknown;
  query?: unknown;
  body?: unknown;
}): string[] {
  const found = new Set<string>();

  const walk = (value: unknown, depth: number): void => {
    if (depth > MAX_DEPTH || value === null || typeof value !== 'object')
      return;
    if (Array.isArray(value)) {
      for (const item of value) walk(item, depth + 1);
      return;
    }
    for (const [key, item] of Object.entries(
      value as Record<string, unknown>,
    )) {
      if (
        isWarehouseField(key) &&
        typeof item === 'string' &&
        UUID.test(item)
      ) {
        found.add(item);
      } else {
        walk(item, depth + 1);
      }
    }
  };

  walk(sources.params, 0);
  walk(sources.query, 0);
  walk(sources.body, 0);
  return [...found];
}

/**
 * Rutas donde la bodega hay que ir a buscarla: la petición trae el id de otra
 * cosa (un traslado, una compra, un conteo) que vive en una bodega.
 *
 * `sql` recibe el id por parámetro y devuelve una columna llamada
 * `warehouse_id`. Se escribe a mano porque cada caso mira una columna distinta:
 * recibir un traslado toca la bodega **destino**, anularlo toca la de **origen**.
 */
export interface EntityWarehouseSource {
  /** Nombre del parámetro de ruta que trae el id. */
  param: string;
  /** Consulta que resuelve la bodega. `$1` es el id. */
  sql: string;
  /** Qué se está intentando hacer, para el mensaje de error. */
  action: string;
}

export const ENTITY_WAREHOUSE_SOURCES: Record<string, EntityWarehouseSource> = {
  // Recibir mercancía entra a la bodega DESTINO.
  'POST inventory/transfers/:id/receive': {
    param: 'id',
    sql: 'SELECT to_warehouse_id AS warehouse_id FROM stock_transfers WHERE id = $1',
    action: 'recibir este traslado',
  },
  // Anular devuelve la mercancía a la bodega de ORIGEN.
  'POST inventory/transfers/:id/cancel': {
    param: 'id',
    sql: 'SELECT from_warehouse_id AS warehouse_id FROM stock_transfers WHERE id = $1',
    action: 'anular este traslado',
  },
  'POST inventory/loans/:id/return': {
    param: 'id',
    sql: 'SELECT from_warehouse_id AS warehouse_id FROM stock_transfers WHERE id = $1',
    action: 'devolver este préstamo',
  },
  'POST purchases/:id/receive': {
    param: 'id',
    sql: 'SELECT warehouse_id FROM purchase_orders WHERE id = $1',
    action: 'recibir esta compra',
  },
  'POST inventory-counts/:id/lines': {
    param: 'id',
    sql: 'SELECT warehouse_id FROM inventory_counts WHERE id = $1',
    action: 'contar en este conteo',
  },
  'POST inventory-counts/:id/close': {
    param: 'id',
    sql: 'SELECT warehouse_id FROM inventory_counts WHERE id = $1',
    action: 'cerrar este conteo',
  },
  // Detallar cajas a inventario: la bodega es la de la orden de compra.
  'POST stock-units/receive/:boxLineId': {
    param: 'boxLineId',
    sql:
      'SELECT po.warehouse_id FROM purchase_box_lines pbl ' +
      'JOIN purchase_orders po ON po.id = pbl.purchase_order_id WHERE pbl.id = $1',
    action: 'detallar estas cajas',
  },
  'POST stock-units/:id/split': {
    param: 'id',
    sql: 'SELECT warehouse_id FROM stock_units WHERE id = $1',
    action: 'abrir esta caja',
  },
  // Tocar una venta ya hecha mueve el inventario de su bodega.
  'POST pos/sales/:id/cancel': {
    param: 'id',
    sql: 'SELECT warehouse_id FROM sales WHERE id = $1',
    action: 'anular esta venta',
  },
  'PATCH pos/sales/:id': {
    param: 'id',
    sql: 'SELECT warehouse_id FROM sales WHERE id = $1',
    action: 'editar esta venta',
  },
  'POST pos/sales/:id/mark-paid': {
    param: 'id',
    sql: 'SELECT warehouse_id FROM sales WHERE id = $1',
    action: 'marcar como pagada esta venta',
  },
  // Devoluciones: el inventario vuelve a la bodega de la venta original.
  'POST returns/:id/approve': {
    param: 'id',
    sql:
      'SELECT s.warehouse_id FROM returns r JOIN sales s ON s.id = r.sale_id ' +
      'WHERE r.id = $1',
    action: 'aprobar esta devolución',
  },
};

/** Ruta de la que el `:id` **es** una bodega, aunque no se llame `warehouseId`. */
const ID_IS_WAREHOUSE = /^inventory\/warehouses\/:[A-Za-z]+/;

/** Normaliza la ruta del patrón de Express: sin `/api`, sin barras sobrantes. */
export function normalizeRoutePath(path: string): string {
  return path
    .replace(/^\/+/, '')
    .replace(/^api\/+/, '')
    .replace(/\/+$/, '');
}

/** ¿El `:id` de esta ruta es una bodega? (`/inventory/warehouses/:id`). */
export function idParamIsWarehouse(routePath: string): boolean {
  return ID_IS_WAREHOUSE.test(normalizeRoutePath(routePath));
}

/** Declaración para esta (método, ruta), si la hay. */
export function entityWarehouseSourceFor(
  method: string,
  routePath: string,
): EntityWarehouseSource | undefined {
  return ENTITY_WAREHOUSE_SOURCES[
    `${method.toUpperCase()} ${normalizeRoutePath(routePath)}`
  ];
}
