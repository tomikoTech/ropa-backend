/**
 * Qué facturas lleva el estado de cuenta de un cliente y cuánto suman.
 *
 * Hay dos: el completo —con lo ya pagado, que sirve de historia— y el de
 * cobro, «uno donde solo envíe lo que nos deben» (Andrea, Distri Amber). En
 * el de cobro los totales son **de esas facturas**: «Facturado» y «Pagado»
 * no pueden arrastrar lo que ya no aparece.
 */

export interface FacturaConSaldo {
  total: number;
  paidAmount: number;
  balance: number;
}

/** Medio peso no es deuda: es redondeo de decimales. */
const NADA = 0.5;

export function soloConSaldo<T extends { balance: number }>(
  facturas: T[],
): T[] {
  return facturas.filter((f) => Number(f.balance) >= NADA);
}

export function totalesDelEstado(facturas: FacturaConSaldo[]): {
  totalCredit: number;
  totalPaid: number;
  totalDebt: number;
} {
  return facturas.reduce(
    (t, f) => ({
      totalCredit: t.totalCredit + Number(f.total),
      totalPaid: t.totalPaid + Number(f.paidAmount),
      totalDebt: t.totalDebt + Number(f.balance),
    }),
    { totalCredit: 0, totalPaid: 0, totalDebt: 0 },
  );
}
