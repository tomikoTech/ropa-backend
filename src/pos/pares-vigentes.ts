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
 *
 * Y un código no puede quedar **dos veces**. Un bulto es una caja física: o
 * está en esta factura o no está, nunca dos. Una tarde de ediciones deja el
 * historial desparejo —tres salidas del mismo código contra dos devoluciones,
 * porque alguna edición no alcanzó a registrar su vuelta— y sin esta regla la
 * lista lo repite. Ese código repetido se reparte entre dos renglones, la
 * pantalla los siembra así, y al guardar el servidor se niega: «esta factura
 * repite un bulto». La factura quedaba imposible de editar sin que nadie
 * pudiera ver por qué.
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

  // Un `Set` y no una lista: conserva el orden de aparición y garantiza que
  // ningún bulto salga dos veces.
  const vigentes = new Set<string>();
  for (const m of movimientos) {
    if (m.quantity >= 0) continue;
    for (const codigo of m.unitBarcodes ?? []) {
      const pendiente = devueltos.get(codigo) ?? 0;
      if (pendiente > 0) {
        // Este código ya volvió: se descuenta una vez y no entra.
        devueltos.set(codigo, pendiente - 1);
        continue;
      }
      vigentes.add(codigo);
    }
  }
  return [...vigentes];
}
