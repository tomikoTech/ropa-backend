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
 *
 * **Un bulto no vale uno: vale lo que trae.** Una caja de 24 es UN bulto con 24
 * unidades adentro. Contarla como una dejaba la línea corta en 23 —«faltaron 23
 * etiquetas»— y esas 23 salían por la cascada, además de las 24 que la caja ya
 * se llevaba. Cada edición de una venta con cajas se comía 24 unidades del
 * inventario y lo dejaba en negativo.
 *
 * Y una caja **no se parte**: si trae 24 y solo faltan 10, no se toma. Vender
 * media caja no significa nada, y descontar 24 para cubrir 10 es peor.
 */

export interface UnidadElegida {
  id: string;
  warehouseId: string;
  /**
   * Cuántas unidades trae ese bulto: una caja de 24 vale 24, un par vale 1.
   * Ausente = uno, que es lo que era antes de que existieran las cajas.
   */
  unidades?: number;
}

export interface RepartoDeUnidades {
  porBodega: {
    warehouseId: string;
    unidades: string[];
    /** Lo que suman esos bultos. NO es `unidades.length` si hay cajas. */
    cantidad: number;
  }[];
  /** Cuántas unidades quedan por cubrir con la cascada. */
  faltan: number;
}

export function repartirPorBodega(
  elegidas: UnidadElegida[],
  cantidad: number,
): RepartoDeUnidades {
  const tope = Math.max(0, Math.trunc(cantidad));
  const vistos = new Set<string>();
  const porBodega = new Map<string, { unidades: string[]; cantidad: number }>();
  let tomadas = 0;

  for (const unidad of elegidas) {
    if (tomadas >= tope) break;
    // El mismo bulto no se puede descontar dos veces: contarlo doble dejaría
    // la línea corta sin que nadie se entere.
    if (vistos.has(unidad.id)) continue;
    const trae = Math.max(1, Math.trunc(unidad.unidades ?? 1));
    // Una caja no se parte: si no cabe en lo que falta, se salta y lo cubre la
    // cascada. Tomarla entera descontaría de más.
    if (tomadas + trae > tope) continue;
    vistos.add(unidad.id);
    const grupo = porBodega.get(unidad.warehouseId);
    if (grupo) {
      grupo.unidades.push(unidad.id);
      grupo.cantidad += trae;
    } else {
      porBodega.set(unidad.warehouseId, {
        unidades: [unidad.id],
        cantidad: trae,
      });
    }
    tomadas += trae;
  }

  return {
    // Ordenado por bodega: dos ediciones iguales tienen que mover las mismas
    // bodegas en el mismo orden, o un descuadre deja de ser reproducible.
    porBodega: [...porBodega.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([warehouseId, grupo]) => ({ warehouseId, ...grupo })),
    faltan: tope - tomadas,
  };
}
