/**
 * Regla pura: ¿se puede reajustar el total de una compra por caja cuando la
 * orden ya tiene cuenta por pagar?
 *
 * Un **aumento** siempre se permite: solo se debe más, ningún abono queda
 * invalidado (agregar una caja es un aumento). Una **baja** se permite solo si
 * la cuenta no tiene pagos; con pagos, bajar el total dejaría la cuenta
 * debiendo menos de lo ya abonado.
 *
 * Sin base de datos: recibe el estado de la cuenta y el total nuevo.
 */
export interface EstadoCuentaPorPagar {
  /** Lo que la cuenta dice deber hoy. */
  amount: number;
  /** Lo ya abonado. */
  paidAmount: number;
  isPaid: boolean;
}

export function puedeReajustarPorCaja(
  cuenta: EstadoCuentaPorPagar | null,
  nuevoTotal: number,
): boolean {
  if (!cuenta) return true; // sin cuenta por pagar, nada que proteger
  const cambia = Number(cuenta.amount) !== nuevoTotal;
  if (!cambia) return true;
  // "Tiene pagos" se mide por dinero abonado de verdad, NO por el flag isPaid:
  // una cuenta en cero (orden vacía recién creada) queda con isPaid=true
  // trivialmente (0 ≥ 0), y eso hacía que agregar la primera caja se bloqueara
  // como si "ya tuviera pagos" —el bug de amawad en una orden nueva—.
  const tienePagos = Number(cuenta.paidAmount) > 0;
  if (!tienePagos) return true; // sin pagos reales, se puede subir o bajar
  return nuevoTotal >= Number(cuenta.amount); // con pagos: solo aumentos
}
