/**
 * Bodega «solo nosotros»: mercancía apartada para los locales propios.
 *
 * «Necesito reservar mercancía para nuestros locales porque si tengo solamente
 * este inventario que todos lo ven, se termina la mercancía y a veces los
 * locales se quedan sin» (Andrea, Distri Amber, 2026-10-27).
 *
 * Una sola regla: de una bodega privada **solo sale lo que se vende en ella**.
 * La cascada de una venta hecha en otra bodega no la toca, y la página web ni
 * la cuenta ni despacha de ella. Quién puede vender ahí lo deciden las bodegas
 * por usuario; esto cuida lo que el permiso no ve.
 */

/** Las existencias que una venta en `bodegaDeLaVenta` puede tomar. */
export function sinBodegasPrivadas<T extends { warehouseId: string }>(
  existencias: T[],
  bodegaDeLaVenta: string | null | undefined,
  esPrivada: (warehouseId: string) => boolean,
): T[] {
  return existencias.filter(
    (e) => e.warehouseId === bodegaDeLaVenta || !esPrivada(e.warehouseId),
  );
}
