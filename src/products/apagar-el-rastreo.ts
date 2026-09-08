/**
 * Cuándo **no** se puede apagar el rastreo por unidades de un producto.
 *
 * `unit_tracking` decide si la mercancía lleva bultos con código impreso.
 * Apagarlo con cajas vivas en la bodega es como tirar las etiquetas a la
 * basura: el sistema deja de mover esos bultos, la venta ya no los marca, la
 * anulación ya no los libera, y el agregado y los códigos se separan en
 * silencio. Pasó de verdad: una venta anulada devolvió el número a la bodega y
 * dejó dos cajas marcadas como vendidas para siempre.
 *
 * Lo peor es que casi nunca es intencional. En la pantalla de producto el
 * interruptor se dibujaba antes de saber qué dice la tienda: quien abría un
 * producto y le cambiaba el precio podía apagarle el rastreo sin enterarse.
 *
 * Esta es la red: el servidor no acepta apagarlo mientras haya bultos que
 * dependan de él. Encenderlo se puede siempre —eso no rompe nada—, y apagarlo
 * también, en cuanto no quede ninguna caja viva.
 */

export interface EstadoDelRastreo {
  /** Lo que el producto dice hoy. `null` = lo que diga la tienda. */
  actual: boolean | null;
  /** Lo que se quiere guardar. `undefined` = no se está tocando. */
  pedido: boolean | null | undefined;
  /** Bultos de este producto que siguen en la bodega. */
  bultosVivos: number;
}

/** ¿Este cambio apaga el rastreo teniendo cajas encima? */
export function apagaElRastreoConBultosVivos(e: EstadoDelRastreo): boolean {
  if (e.pedido === undefined) return false;
  if (e.pedido !== false) return false;
  // Ya estaba explícitamente apagado: guardar lo mismo no cambia nada.
  if (e.actual === false) return false;
  return (Number(e.bultosVivos) || 0) > 0;
}

export function porQueNoSePuedeApagar(bultosVivos: number): string {
  const cajas =
    bultosVivos === 1 ? 'una caja etiquetada' : `${bultosVivos} cajas etiquetadas`;
  return (
    `No se puede apagar el manejo por cajas: este producto todavía tiene ${cajas} ` +
    'en bodega. Apagarlo dejaría esas etiquetas sin efecto —sus códigos no se ' +
    'podrían vender ni devolver— y el inventario quedaría descuadrado. ' +
    'Sácalas del inventario primero, o déjalo encendido.'
  );
}
