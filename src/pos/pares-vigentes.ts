/**
 * Qué pares sigue teniendo una factura después de editarla.
 *
 * El detalle de la venta leía **todos** los movimientos de tipo `SALE` de esa
 * factura y tomaba los primeros. Editar una venta deja tres movimientos en la
 * base —la salida original, la devolución de la edición y la salida nueva— así
 * que el detalle terminaba mostrando el par que se había **devuelto**.
 *
 * Con los códigos impresos en la caja eso es grave: el cliente vuelve con un
 * par, se edita la factura, y la factura sigue diciendo que se llevó el otro.
 *
 * La cuenta es **por signo, no por tipo de movimiento**: lo que salió suma, lo
 * que volvió resta. Así también sirve para una anulación parcial y para
 * cualquier motivo que se agregue después, sin tener que acordarse de este
 * archivo.
 */

export interface MovimientoConPares {
  /** Negativo cuando salió de la bodega, positivo cuando volvió. */
  quantity: number;
  unitBarcodes: string[] | null;
}

export function paresVigentesDeLaVenta(
  movimientos: MovimientoConPares[],
): string[] {
  // Cuántas veces volvió cada código. Se resta después, para no depender del
  // orden en que la base devuelva las filas.
  const devueltos = new Map<string, number>();
  for (const m of movimientos) {
    if (m.quantity <= 0) continue;
    for (const codigo of m.unitBarcodes ?? []) {
      devueltos.set(codigo, (devueltos.get(codigo) ?? 0) + 1);
    }
  }

  const vigentes: string[] = [];
  for (const m of movimientos) {
    if (m.quantity >= 0) continue;
    for (const codigo of m.unitBarcodes ?? []) {
      const pendiente = devueltos.get(codigo) ?? 0;
      if (pendiente > 0) {
        // Este código ya volvió: se descuenta una vez y no entra.
        devueltos.set(codigo, pendiente - 1);
        continue;
      }
      vigentes.push(codigo);
    }
  }
  return vigentes;
}
