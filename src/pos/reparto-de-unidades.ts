/**
 * Cuando la edición de una factura dice **cuáles** pares se lleva.
 *
 * Al editar una venta, el servidor revierte todo y vuelve a aplicar. Si nadie
 * dice qué pares tomar, el inventario los elige por antigüedad — y ahí está el
 * problema: el cliente devuelve **uno** de los dos pares que compró, se baja la
 * cantidad de dos a uno, y el par que queda registrado como vendido **no es el
 * que el cliente se llevó**. El código impreso en la caja que sigue en su casa
 * figura como devuelto. El inventario dice la verdad en cantidad y miente en
 * identidad, que es justo lo que los códigos por par existen para evitar.
 *
 * `ledger.mover` descuenta de **una** bodega, así que los pares elegidos hay
 * que agruparlos por dónde están. Y puede que no alcancen para toda la línea:
 * el resto sale de la cascada de siempre, y por eso se devuelve cuántos faltan
 * en vez de fallar.
 */

export interface UnidadElegida {
  id: string;
  warehouseId: string;
}

export interface RepartoDeUnidades {
  porBodega: { warehouseId: string; unidades: string[] }[];
  /** Cuántas unidades quedan por cubrir con la cascada. */
  faltan: number;
}

export function repartirPorBodega(
  elegidas: UnidadElegida[],
  cantidad: number,
): RepartoDeUnidades {
  const tope = Math.max(0, Math.trunc(cantidad));
  const vistos = new Set<string>();
  const porBodega = new Map<string, string[]>();
  let tomadas = 0;

  for (const unidad of elegidas) {
    if (tomadas >= tope) break;
    // El mismo bulto no se puede descontar dos veces: contarlo doble dejaría
    // la línea corta sin que nadie se entere.
    if (vistos.has(unidad.id)) continue;
    vistos.add(unidad.id);
    const lista = porBodega.get(unidad.warehouseId);
    if (lista) lista.push(unidad.id);
    else porBodega.set(unidad.warehouseId, [unidad.id]);
    tomadas++;
  }

  return {
    // Ordenado por bodega: dos ediciones iguales tienen que mover las mismas
    // bodegas en el mismo orden, o un descuadre deja de ser reproducible.
    porBodega: [...porBodega.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([warehouseId, unidades]) => ({ warehouseId, unidades })),
    faltan: tope - tomadas,
  };
}
