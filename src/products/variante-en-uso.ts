/**
 * Cuándo una variante **no** se puede quitar de un producto.
 *
 * Editar un producto manda su lista de variantes, y el servidor trataba lo que
 * no viniera en esa lista como «esto ya no existe»: la borraba, y si no podía
 * borrarla —porque tenía ventas— la **desactivaba en silencio**.
 *
 * Una variante desactivada no se puede vender: el punto de venta contesta «este
 * producto no está activo» con las cajas ahí, en la bodega, con su código
 * impreso. Pasó de verdad: una edición se llevó por delante una variante con
 * tres cajas y 49 pares. Nadie tocó esa talla; simplemente no venía en el
 * formulario.
 *
 * Regla: **la mercancía manda sobre el formulario**. Si tiene existencias o
 * bultos vivos, se queda como está; quitarla es una decisión aparte y
 * explícita, no el efecto de guardar otra cosa.
 */

/** Lo que hay que saber de una variante para decidir. */
export interface UsoDeLaVariante {
  /** Unidades en el agregado, sumando bodegas. */
  existencias: number;
  /** Bultos que aún están en la bodega (no vendidos ni dados de baja). */
  bultosVivos: number;
}

export function seQuedaAunqueNoVengaEnElFormulario(
  uso: UsoDeLaVariante,
): boolean {
  return (
    (Number(uso.existencias) || 0) > 0 || (Number(uso.bultosVivos) || 0) > 0
  );
}

/** Lo que se le dice a quien guardó, para que no se entere por el POS. */
export function avisoDeVariantesConservadas(skus: string[]): string | null {
  if (!skus.length) return null;
  const lista = skus.join(', ');
  return skus.length === 1
    ? `La variante ${lista} no se quitó porque todavía tiene mercancía en bodega. Sácala del inventario primero.`
    : `Estas variantes no se quitaron porque todavía tienen mercancía en bodega: ${lista}. Sácalas del inventario primero.`;
}
