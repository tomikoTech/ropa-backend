/**
 * El punto de venta de quien no tiene inventario.
 *
 * El caso: una persona natural que compra al detal en una tienda y revende.
 * No tiene bodega, ni proveedores, ni existencias que cuadrar; compra el lunes
 * y anota cuando vende. Todo lo que vende es, literalmente, de un tercero.
 *
 * Para esa persona, MiPinta entero sobra: necesita el punto de venta y una
 * sola forma de vender. Este modulo enciende ese modo.
 *
 * Es un permiso propio y **no algo deducido** de los demas: ya se intento
 * deducir una pantalla de otros permisos —la del vendedor con bodegas— y darle
 * a alguien un permiso mas le cambiaba la pantalla entera sin querer.
 *
 * Espejo en el frontend: `src/lib/pos-de-terceros.ts`. Aca decide que se
 * permite; alla, que se dibuja.
 */
import type { Puede, Quien } from './pantalla-de-ventas.js';

export const MODULO_POS_TERCEROS = 'pos-terceros';

export function soloVendeDeTerceros(
  puede: Puede | null,
  quien: Quien = { sinMatriz: false },
): boolean {
  if (!puede || quien.sinMatriz) return false;
  return puede(MODULO_POS_TERCEROS, 'list');
}
