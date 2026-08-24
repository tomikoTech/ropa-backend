/**
 * Si el costo puede viajar en esta respuesta.
 *
 * La regla de siempre: el costo de la mercancia no sale si el usuario no ve
 * Productos.
 *
 * Con una excepcion que no es una excepcion. En una **venta de tercero** el
 * costo es lo que le debe al dueno del producto: su propia plata, no el costo
 * de la mercancia de una tienda. A quien revende —que no tiene productos, ni
 * bodega, ni inventario— taparselo le esconde la mitad de su contabilidad, y
 * la pantalla le mostraba «$ NaN» justo donde va lo que debe.
 *
 * Puro: entra una ruta y dos permisos, sale si el costo viaja.
 */
const RUTA_TERCEROS = '/api/consignments';

export function puedeVerElCosto(
  ruta: string,
  quien: { veProductos: boolean; veTerceros: boolean },
): boolean {
  if (quien.veProductos) return true;
  if (!quien.veTerceros) return false;
  // `/api/consignments` y lo que cuelga de el, pero no `/api/consignments-x`.
  return ruta === RUTA_TERCEROS || ruta.startsWith(`${RUTA_TERCEROS}/`);
}
