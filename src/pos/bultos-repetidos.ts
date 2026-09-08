/**
 * Un bulto no puede estar en dos renglones de la misma factura.
 *
 * Cada código es **ese** par o **esa** caja: si aparece dos veces, la factura
 * está diciendo que vendió dos veces la misma mercancía. El servidor lo
 * descubría tarde y mal —al intentar descontarlo por segunda vez contestaba «el
 * código … ya no está disponible», que no explica nada— o directamente lo
 * dejaba pasar.
 *
 * Pasó de verdad: una pantalla aplanó siete cajas de 24 en 168 renglones de un
 * par, cada uno arrastrando el código de su caja. La factura quedó con 166
 * líneas, las cajas perdieron su naturaleza y el inventario terminó diciendo
 * que había una unidad donde hay cuarenta y ocho.
 *
 * Se comprueba **antes** de tocar nada, para que el rechazo no deje la venta a
 * medias y para que el mensaje diga qué código y cuántas veces.
 */

export interface RenglonConBultos {
  stockUnitIds?: string[];
}

/** Los códigos que vienen más de una vez, con su cuenta. */
export function bultosRepetidos(
  renglones: RenglonConBultos[],
): { id: string; veces: number }[] {
  const cuenta = new Map<string, number>();
  for (const renglon of renglones) {
    for (const id of renglon.stockUnitIds ?? []) {
      cuenta.set(id, (cuenta.get(id) ?? 0) + 1);
    }
  }
  return [...cuenta.entries()]
    .filter(([, veces]) => veces > 1)
    .map(([id, veces]) => ({ id, veces }));
}

export function porQueNoSePuedeGuardar(
  repetidos: { id: string; veces: number }[],
): string {
  const cuantos = repetidos.length;
  const detalle = repetidos
    .slice(0, 3)
    .map((r) => `${r.id} (${r.veces} veces)`)
    .join(', ');
  const resto = cuantos > 3 ? ` y ${cuantos - 3} más` : '';
  return (
    `Esta factura repite ${cuantos === 1 ? 'un bulto' : `${cuantos} bultos`}: ` +
    `${detalle}${resto}. Cada código es una caja o un par concreto y no se ` +
    'puede vender dos veces. Vuelve a abrir la venta y revisa sus renglones.'
  );
}
