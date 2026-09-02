/**
 * Las cuentas de una venta de tercero, puras y en **centavos enteros**.
 *
 * Dos lados de plata por cada venta:
 *   - CLIENT   → lo que te paga el cliente (cuenta por cobrar mientras falte).
 *   - SUPPLIER → lo que tú le pagas al tercero dueño (cuenta por pagar).
 *
 * Cada lado admite **abonos parciales**, cada uno con su método (efectivo,
 * transferencia…). El saldo es el total menos lo abonado. "Pagado" es saldo
 * en cero: no se guarda un booleano que pueda contradecir a los abonos.
 *
 * Sin base de datos ni dinero flotante: pesos con decimales redondean a
 * centavos una sola vez, al entrar.
 */

export type LadoDeAbono = 'CLIENT' | 'SUPPLIER';

export interface AbonoLike {
  lado: LadoDeAbono;
  /** Monto en pesos (se redondea a centavos). */
  amount: number;
  /** EFECTIVO | TRANSFERENCIA | … Normalizado aguas arriba. */
  method?: string | null;
}

export interface VentaLike {
  /** Precio de venta unitario, en pesos. */
  salePrice: number;
  /** Costo unitario (lo que le debes al tercero), en pesos. */
  costPrice: number;
  quantity: number;
}

export interface CuentasDeVenta {
  totalVentaCents: number;
  totalCostoCents: number;
  cobradoClienteCents: number;
  pagadoTerceroCents: number;
  /** Lo que te debe el cliente (nunca negativo). */
  saldoClienteCents: number;
  /** Lo que le debes al tercero (nunca negativo). */
  saldoTerceroCents: number;
  clientPaid: boolean;
  supplierPaid: boolean;
}

export function aCentavos(pesos: number): number {
  return Math.round((Number(pesos) || 0) * 100);
}

export function aPesos(centavos: number): number {
  return centavos / 100;
}

export function cuentasDeVenta(
  venta: VentaLike,
  abonos: AbonoLike[],
): CuentasDeVenta {
  const qty = Math.max(1, Math.trunc(venta.quantity || 1));
  const totalVentaCents = aCentavos(venta.salePrice) * qty;
  const totalCostoCents = aCentavos(venta.costPrice) * qty;

  let cobradoClienteCents = 0;
  let pagadoTerceroCents = 0;
  for (const a of abonos) {
    const c = aCentavos(a.amount);
    if (a.lado === 'CLIENT') cobradoClienteCents += c;
    else if (a.lado === 'SUPPLIER') pagadoTerceroCents += c;
  }

  const saldoClienteCents = Math.max(0, totalVentaCents - cobradoClienteCents);
  const saldoTerceroCents = Math.max(0, totalCostoCents - pagadoTerceroCents);

  return {
    totalVentaCents,
    totalCostoCents,
    cobradoClienteCents,
    pagadoTerceroCents,
    saldoClienteCents,
    saldoTerceroCents,
    // Cobrado de más (un abono mayor al saldo) igual cuenta como pagado.
    clientPaid: cobradoClienteCents >= totalVentaCents,
    supplierPaid: pagadoTerceroCents >= totalCostoCents,
  };
}

/**
 * Cuánto abonó un lado que aún no puede volver a abonar: el saldo. Se usa para
 * validar un abono nuevo (no dejar abonar más que el saldo).
 */
export function saldoDelLado(
  venta: VentaLike,
  abonos: AbonoLike[],
  lado: LadoDeAbono,
): number {
  const c = cuentasDeVenta(venta, abonos);
  return lado === 'CLIENT' ? c.saldoClienteCents : c.saldoTerceroCents;
}

export interface FilaDeMetodo {
  metodo: string;
  cobradoCents: number;
}

export interface ResumenPorMetodo {
  /** Lo que te pagaron los clientes, agrupado por método (efectivo/transf…). */
  porMetodo: FilaDeMetodo[];
  /** Lo que te quedan debiendo los clientes (saldo por cobrar). */
  creditoCents: number;
  /** Suma de todos los métodos (lo efectivamente cobrado). */
  totalCobradoCents: number;
}

/**
 * El desglose que pide el mostrador: cuánto entró por efectivo, cuánto por
 * transferencia, y cuánto quedó a crédito (lo que aún deben). "Crédito" no es
 * un método de cobro: es lo que **no** se ha cobrado.
 */
export function resumenPorMetodo(
  ventas: { venta: VentaLike; abonos: AbonoLike[] }[],
): ResumenPorMetodo {
  const porMetodo = new Map<string, number>();
  let creditoCents = 0;
  let totalCobradoCents = 0;

  for (const { venta, abonos } of ventas) {
    for (const a of abonos) {
      if (a.lado !== 'CLIENT') continue;
      const c = aCentavos(a.amount);
      const metodo = (a.method || 'OTRO').toUpperCase();
      porMetodo.set(metodo, (porMetodo.get(metodo) ?? 0) + c);
      totalCobradoCents += c;
    }
    creditoCents += cuentasDeVenta(venta, abonos).saldoClienteCents;
  }

  return {
    porMetodo: [...porMetodo.entries()]
      .map(([metodo, cobradoCents]) => ({ metodo, cobradoCents }))
      .sort((a, b) => b.cobradoCents - a.cobradoCents),
    creditoCents,
    totalCobradoCents,
  };
}
