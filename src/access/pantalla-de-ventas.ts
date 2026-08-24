/**
 * El perfil de ventas: qué ve y qué puede cerrar.
 *
 * Son **dos preguntas distintas**, y confundirlas fue el primer intento: la
 * pantalla simplificada se deducía de «no puede cerrar ventas», así que darle
 * a alguien el permiso de cobrar le devolvía el sistema entero. El dueño quería
 * lo contrario: los dos perfiles ven **lo mismo**, y lo único que cambia es si
 * al final cobran o piden permiso.
 *
 * Por eso la pantalla es un módulo propio de la matriz —se enciende y se apaga
 * como cualquier otro, en cualquier tienda— y la autorización sale de si tiene
 * «Crear» en Ventas, que ya existía y significa exactamente eso.
 *
 * Puro: entra una función de permisos, sale una decisión.
 */
export const MODULO_PANTALLA_SIMPLE = 'vender';

/** Lo que hace falta saber: si puede tal cosa. */
export type Puede = (modulo: string, accion?: string) => boolean;

/**
 * Quién pregunta.
 *
 * `sinMatriz` es el administrador o la plataforma: `AccessService.userCan` les
 * devuelve **true para todo**, así que sin esto quedaban clasificados como
 * pantalla simplificada y su historial de ventas se reducía a lo suyo —la
 * tienda entera desaparecía—.
 */
export interface Quien {
  sinMatriz: boolean;
}

export function usaPantallaSimple(
  puede: Puede | null,
  quien: Quien = { sinMatriz: false },
): boolean {
  if (!puede || quien.sinMatriz) return false;
  return puede(MODULO_PANTALLA_SIMPLE, 'list');
}

/**
 * Sin permisos cargados se asume que **sí** hace falta autorización: pedir
 * permiso de más es un trámite; cobrar de más es plata.
 */
export function necesitaAutorizacion(puede: Puede | null): boolean {
  if (!puede) return true;
  return !puede('sales', 'create');
}

/**
 * A qué usuario limitar el listado de ventas, o `null` para no limitarlo.
 *
 * `GET /pos/sales` no filtraba por vendedor: cualquiera con «Ver» en Ventas
 * veía la plata de toda la tienda, con los clientes y los montos de los demás.
 * En la pantalla simplificada eso es justo lo que no puede pasar.
 */
export function soloSusVentas(
  puede: Puede | null,
  usuarioId: string,
  quien: Quien = { sinMatriz: false },
): string | null {
  // Sin repetir acá lo de `sinMatriz`: se probó, y esa línea no podía decidir
  // nada porque `usaPantallaSimple` ya devuelve false para quien no tiene
  // matriz. Una condición que ninguna mutación rompe no está haciendo nada.
  return usaPantallaSimple(puede, quien) || !puede ? usuarioId : null;
}
