/**
 * Costeo de importación (landed cost).
 *
 * Al importar, el costo real de una unidad no es lo que dice la factura del
 * proveedor: hay que convertir la moneda y repartir los fletes y gastos de
 * nacionalización entre todo lo que vino en el embarque.
 *
 *     costo puesto en bodega = costo del proveedor × tasa de cambio
 *                            + parte proporcional de los fletes
 *
 * El reparto de los fletes se hace **por unidades** (cada unidad carga lo
 * mismo). La alternativa es repartir **por valor** (las unidades caras cargan
 * más), que es más fiel cuando conviven ítems de precios muy distintos; queda
 * disponible en `FreightAllocation` para cuando se necesite.
 */

export type FreightAllocation = 'BY_UNITS' | 'BY_VALUE';

export interface FreightCost {
  /** Concepto legible: "Naviera", "Aduana", "Transporte interno"... */
  label: string;
  amount: number;
}

/** Una línea del embarque, ya sea por cajas o por unidades sueltas. */
export interface CostableLine {
  id: string;
  /** Unidades totales de la línea (cajas × unidades por caja, o la cantidad). */
  units: number;
  /** Costo unitario en la moneda del proveedor. */
  unitCost: number;
}

export interface LineLandedCost {
  id: string;
  units: number;
  /** Costo unitario ya convertido a moneda local, sin fletes. */
  baseUnitCost: number;
  /** Flete asignado a la línea completa. */
  freightShare: number;
  /** Costo final por unidad, puesto en bodega. */
  landedUnitCost: number;
  /** Costo final de la línea completa. */
  landedTotal: number;
}

export interface LandedCostResult {
  totalUnits: number;
  freightTotal: number;
  /** Suma de (costo proveedor × tasa) de todas las líneas. */
  goodsTotal: number;
  /** goodsTotal + freightTotal. Es lo que realmente costó el embarque. */
  landedTotal: number;
  lines: LineLandedCost[];
}

/** Redondea a 2 decimales evitando el arrastre binario (0.1+0.2). */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function calculateLandedCost(
  lines: CostableLine[],
  options: {
    exchangeRate?: number;
    freightCosts?: FreightCost[];
    allocation?: FreightAllocation;
  } = {},
): LandedCostResult {
  const rate =
    options.exchangeRate && options.exchangeRate > 0 ? options.exchangeRate : 1;
  const allocation = options.allocation ?? 'BY_UNITS';
  const freightTotal = round2(
    (options.freightCosts ?? []).reduce((sum, f) => sum + (f.amount || 0), 0),
  );

  const totalUnits = lines.reduce((sum, l) => sum + Math.max(0, l.units), 0);
  const goodsTotal = round2(
    lines.reduce((sum, l) => sum + l.units * l.unitCost * rate, 0),
  );

  // Sin unidades no hay entre qué repartir: se devuelven las líneas en cero en
  // vez de dividir por cero.
  if (totalUnits === 0) {
    return {
      totalUnits: 0,
      freightTotal,
      goodsTotal: 0,
      landedTotal: freightTotal,
      lines: lines.map((l) => ({
        id: l.id,
        units: 0,
        baseUnitCost: round2(l.unitCost * rate),
        freightShare: 0,
        landedUnitCost: round2(l.unitCost * rate),
        landedTotal: 0,
      })),
    };
  }

  const weightOf = (l: CostableLine) =>
    allocation === 'BY_VALUE' ? l.units * l.unitCost * rate : l.units;
  const totalWeight = lines.reduce((sum, l) => sum + weightOf(l), 0);

  // Si se reparte por valor y todo vale 0, el peso total es 0: se cae a
  // unidades para no perder el flete.
  const useUnits = totalWeight <= 0;

  const result: LineLandedCost[] = lines.map((l) => {
    const weight = useUnits ? l.units : weightOf(l);
    const denominator = useUnits ? totalUnits : totalWeight;
    const freightShare =
      denominator > 0 ? round2((freightTotal * weight) / denominator) : 0;
    const baseUnitCost = round2(l.unitCost * rate);
    const landedTotal = round2(l.units * baseUnitCost + freightShare);
    return {
      id: l.id,
      units: l.units,
      baseUnitCost,
      freightShare,
      landedUnitCost:
        l.units > 0 ? round2(landedTotal / l.units) : baseUnitCost,
      landedTotal,
    };
  });

  // El redondeo por línea puede dejar céntimos sin asignar; se ajusta la línea
  // de mayor flete para que la suma cuadre exactamente con el flete pagado.
  const assigned = round2(result.reduce((s, r) => s + r.freightShare, 0));
  const drift = round2(freightTotal - assigned);
  if (drift !== 0 && result.length > 0) {
    const target = result.reduce((max, r) =>
      r.freightShare > max.freightShare ? r : max,
    );
    target.freightShare = round2(target.freightShare + drift);
    target.landedTotal = round2(
      target.units * target.baseUnitCost + target.freightShare,
    );
    target.landedUnitCost =
      target.units > 0
        ? round2(target.landedTotal / target.units)
        : target.baseUnitCost;
  }

  return {
    totalUnits,
    freightTotal,
    goodsTotal,
    landedTotal: round2(goodsTotal + freightTotal),
    lines: result,
  };
}
