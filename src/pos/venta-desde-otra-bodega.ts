/**
 * Cuándo una venta se está llevando mercancía de otro local.
 *
 * El punto de venta tiene una cascada: si la bodega de la venta no alcanza,
 * descuenta de las demás por existencia. Comprobado el 24 de agosto con el
 * local en cero: la venta se hizo **en el Local** y el par salió de la
 * **Sucursal**, sin decir nada.
 *
 * Deja dos cosas torcidas a la vez. El cliente está parado en el Local y el par
 * está en la Sucursal, así que alguien se va sin su mercancía o hay que ir a
 * buscarla. Y el inventario de la Sucursal baja sin que nadie mueva nada: al
 * contar, faltan pares que el papel ya no tiene.
 *
 * La cascada no se quita —hay tiendas que trabajan así, con la bodega detrás
 * del mostrador— pero deja de ser silenciosa: **quien vende decide**, sabiendo
 * de dónde va a salir.
 *
 * Solo mira la bodega de la venta contra lo pedido. Lo que pase después
 * —cuánto sacar de cada una— sigue siendo del ledger.
 */

export interface ExistenciaPorBodega {
  warehouseId: string;
  nombre: string;
  disponible: number;
}

export interface FaltanteEnElLocal {
  /** Cuántas unidades no alcanzan en la bodega de la venta. */
  faltan: number;
  /** Cuánto hay en el propio local. */
  enElLocal: number;
  /** Dónde sí las hay, de mayor a menor. */
  otras: { nombre: string; disponible: number }[];
}

export function faltaEnElLocal(params: {
  bodegaDeLaVenta: string;
  pedido: number;
  existencias: ExistenciaPorBodega[];
}): FaltanteEnElLocal | null {
  const pedido = Math.max(0, Math.trunc(params.pedido));

  // Pedir cero sale por el `>=` de abajo: `enElLocal` nunca es negativo
  // —cada fila se acota a cero— así que 0 >= 0 devuelve nulo solo.
  const enElLocal = params.existencias
    .filter((e) => e.warehouseId === params.bodegaDeLaVenta)
    .reduce((suma, e) => suma + Math.max(0, e.disponible), 0);
  if (enElLocal >= pedido) return null;

  const otras = params.existencias
    .filter((e) => e.warehouseId !== params.bodegaDeLaVenta && e.disponible > 0)
    .map((e) => ({ nombre: e.nombre, disponible: e.disponible }))
    .sort((a, b) => b.disponible - a.disponible);

  // Sin existencia en ninguna parte no hay nada que confirmar: eso es un
  // faltante de verdad, y lo rechaza la validación de stock de siempre.
  if (otras.length === 0) return null;

  return { faltan: pedido - enElLocal, enElLocal, otras };
}

/** Lo que se le dice a quien está vendiendo, con la mercancía en la mano. */
export function explicarOtraBodega(
  producto: string,
  falta: FaltanteEnElLocal,
): string {
  const donde = falta.otras
    .map((o) => `${o.nombre} (${o.disponible})`)
    .join(', ');
  const enLocal =
    falta.enElLocal === 0
      ? 'no queda ninguno en este local'
      : `en este local solo quedan ${falta.enElLocal}`;
  return (
    `${producto}: ${enLocal}. ${falta.faltan} saldría(n) de ${donde}. ` +
    `Confirma si la mercancía se va a entregar desde allá.`
  );
}
