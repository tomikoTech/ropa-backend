/**
 * Reporte de calle **por patinador**: cuánto sacó, vendió, devolvió, todavía
 * tiene en la calle y cuánto recaudó cada uno, en un periodo.
 *
 * El sistema anterior tenía un corte dedicado por impulsador; MiPinta ya
 * registraba cada despacho, pero el dato estaba repartido despacho por
 * despacho. Acá se junta por persona.
 *
 * Toda la plata va en **centavos enteros** para no arrastrar el error de coma
 * flotante de sumar decimales; el servicio convierte los `decimal` de la base
 * a centavos antes de entrar, y la pantalla divide de vuelta al mostrar.
 *
 * Regla que se hereda del balance: `unitCost = 0` es «sin costo registrado»,
 * no «costo cero». Esas ventas quedan fuera de la ganancia y la fila lo avisa
 * con `sinCosto`, para no mostrar una utilidad inflada.
 */

/** Estado del despacho, tal como lo guarda la base. */
export type EstadoDespacho = 'OPEN' | 'SETTLED' | 'CANCELLED';

export interface ItemDeReporte {
  /** Unidades despachadas (lo que sacó). */
  quantity: number;
  /** Unidades vendidas al liquidar. */
  quantitySold: number;
  /** Unidades devueltas al liquidar. */
  quantityReturned: number;
  /** Precio de venta unitario, en centavos. */
  unitPriceCents: number;
  /** Costo unitario, en centavos (0 = sin costo registrado). */
  unitCostCents: number;
}

export interface DespachoDeReporte {
  sellerId: string;
  sellerName: string;
  status: EstadoDespacho;
  /** Lo efectivamente cobrado al liquidar, en centavos (null si no aplica). */
  collectedAmountCents: number | null;
  items: ItemDeReporte[];
}

export interface FilaPorPatinador {
  sellerId: string;
  sellerName: string;
  /** Cuántos despachos (sin contar los cancelados). */
  despachos: number;
  /** Pares que sacó. */
  despachadas: number;
  /** Valor de lo despachado a precio de venta, en centavos. */
  valorDespachadoCents: number;
  /** Pares vendidos. */
  vendidas: number;
  /** Ingreso por lo vendido (a precio), en centavos. */
  ingresosCents: number;
  /** Pares devueltos. */
  devueltas: number;
  /** Pares que todavía tiene en la calle (despachos abiertos, sin liquidar). */
  enCalle: number;
  /** Lo efectivamente recaudado en las liquidaciones, en centavos. */
  recaudadoCents: number;
  /** Ganancia de lo vendido con costo conocido, en centavos. */
  gananciaCents: number;
  /** Hubo ventas sin costo registrado: la ganancia queda incompleta. */
  sinCosto: boolean;
}

export interface ResumenPorPatinador {
  filas: FilaPorPatinador[];
  totales: Omit<FilaPorPatinador, 'sellerId' | 'sellerName'>;
}

function filaVacia(sellerId: string, sellerName: string): FilaPorPatinador {
  return {
    sellerId,
    sellerName,
    despachos: 0,
    despachadas: 0,
    valorDespachadoCents: 0,
    vendidas: 0,
    ingresosCents: 0,
    devueltas: 0,
    enCalle: 0,
    recaudadoCents: 0,
    gananciaCents: 0,
    sinCosto: false,
  };
}

/**
 * Agrupa los despachos por patinador. Los despachos **cancelados** no cuentan
 * para nada: no sacaron ni vendieron mercancía. El orden de salida es por lo
 * que más vendió (y a igualdad, por nombre), que es como se lee un ranking.
 */
export function resumenPorPatinador(
  despachos: DespachoDeReporte[],
): ResumenPorPatinador {
  const porPatinador = new Map<string, FilaPorPatinador>();

  for (const d of despachos) {
    if (d.status === 'CANCELLED') continue;
    const fila =
      porPatinador.get(d.sellerId) ?? filaVacia(d.sellerId, d.sellerName);
    fila.despachos += 1;
    fila.recaudadoCents += d.collectedAmountCents ?? 0;

    for (const it of d.items) {
      fila.despachadas += it.quantity;
      fila.valorDespachadoCents += it.quantity * it.unitPriceCents;
      fila.vendidas += it.quantitySold;
      fila.ingresosCents += it.quantitySold * it.unitPriceCents;
      fila.devueltas += it.quantityReturned;
      // Lo que todavía no volvió ni se vendió solo sigue "en la calle" si el
      // despacho está abierto; si ya se liquidó, ese saldo se dio por perdido
      // o ajustado y no cuenta como mercancía viva.
      if (d.status === 'OPEN') {
        fila.enCalle += Math.max(
          0,
          it.quantity - it.quantitySold - it.quantityReturned,
        );
      }
      if (it.quantitySold > 0) {
        if (it.unitCostCents > 0) {
          fila.gananciaCents +=
            it.quantitySold * (it.unitPriceCents - it.unitCostCents);
        } else {
          fila.sinCosto = true;
        }
      }
    }

    porPatinador.set(d.sellerId, fila);
  }

  const filas = [...porPatinador.values()].sort(
    (a, b) => b.vendidas - a.vendidas || a.sellerName.localeCompare(b.sellerName),
  );

  const totales = filas.reduce(
    (acc, f) => {
      acc.despachos += f.despachos;
      acc.despachadas += f.despachadas;
      acc.valorDespachadoCents += f.valorDespachadoCents;
      acc.vendidas += f.vendidas;
      acc.ingresosCents += f.ingresosCents;
      acc.devueltas += f.devueltas;
      acc.enCalle += f.enCalle;
      acc.recaudadoCents += f.recaudadoCents;
      acc.gananciaCents += f.gananciaCents;
      acc.sinCosto = acc.sinCosto || f.sinCosto;
      return acc;
    },
    filaVacia('', '') as FilaPorPatinador,
  );
  // Quita las dos llaves de identidad que no aplican al total.
  const { sellerId: _id, sellerName: _n, ...totalesSinId } = totales;

  return { filas, totales: totalesSinId };
}
