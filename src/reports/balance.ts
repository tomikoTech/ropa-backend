/**
 * El balance del negocio: lo que quedó, después de todo.
 *
 * Un dueño de tres locales lo enumeró mirando su aplicación: «ganancia,
 * recuperación, gastos, inversiones… ahí ya salen las ganancias, salen como
 * las inversiones, cuánto se ha recuperado el capital», y más adelante «lo que
 * uno debe y lo que uno tiene de capital», con los abonos bajando la deuda.
 *
 * Todo eso ya existía en MiPinta repartido en seis familias de reportes,
 * gastos, ingresos, cuentas por pagar y por cobrar. Lo que no existía era
 * **verlo junto y del mismo periodo**, que es lo único que permite decidir.
 *
 * La aritmética vive acá, aparte del servicio y sin base de datos, por lo
 * mismo que la del cuadre de caja: es donde un peso mal puesto cambia una
 * decisión sobre si un local se sostiene.
 *
 * **Todo en centavos enteros.** Los montos llegan de Postgres como `decimal`
 * (texto) y sumarlos como float deja totales que en pantalla se ven bien y
 * contra el papel no dan.
 *
 * Y una advertencia del mismo dueño sobre lo que **no** hay que construir: de
 * las estadísticas del día de su app dijo «eso casi no se usa, no es
 * relevante, yo eso lo quitaría».
 */

/**
 * Qué mueve la plata.
 *
 * Los cuatro últimos existen para **no** contarse dos veces, que es el error
 * clásico de estos tableros: el abono de un cliente no es una venta nueva —la
 * venta se contó el día que se hizo— y pagarle al proveedor no es un gasto
 * —el costo se contó al vender—.
 */
export type TipoDeMovimiento =
  | 'VENTA'
  | 'GASTO'
  | 'COMPRA'
  | 'ABONO'
  | 'PAGO_PROVEEDOR';

export interface MovimientoDelBalance {
  tipo: TipoDeMovimiento;
  /** Centavos enteros. */
  centavos: number;
  /**
   * Lo que costó la mercancía de esa venta.
   *
   * `null` cuando no se sabe —ventas importadas de sistemas viejos, que no
   * traen costo—. Tratarlo como cero dispararía la ganancia y nadie entendería
   * por qué el mes fue buenísimo; por eso se cuentan aparte y se dicen.
   */
  costoCentavos: number | null;
  /** Nulo para lo que no es de ningún local: el arriendo de la bodega. */
  localId: string | null;
  anulado: boolean;
}

/** Lo que la tienda tiene y lo que debe, hoy. No es del periodo: es un saldo. */
export interface SaldosDelBalance {
  inventarioCentavos: number;
  porCobrarCentavos: number;
  porPagarCentavos: number;
}

export interface BalanceDeUnLocal {
  localId: string;
  ventas: number;
  recuperacion: number;
  ganancia: number;
  gastos: number;
  inversion: number;
  utilidadNeta: number;
  ventasSinCosto: number;
}

export interface Balance extends Omit<BalanceDeUnLocal, 'localId'> {
  /** Lo cobrado de lo fiado. Entra plata, pero la venta ya se contó. */
  recaudo: number;
  /** Lo abonado a proveedores. Baja la deuda; el costo ya se contó. */
  pagosAProveedores: number;
  inventario: number;
  porCobrar: number;
  porPagar: number;
  /** Lo que hay menos lo que se debe. */
  capital: number;
  /** Utilidad bruta sobre ventas, en porcentaje con un decimal. */
  margen: number;
  porLocal: BalanceDeUnLocal[];
}

const enCero = (localId: string): BalanceDeUnLocal => ({
  localId,
  ventas: 0,
  recuperacion: 0,
  ganancia: 0,
  gastos: 0,
  inversion: 0,
  utilidadNeta: 0,
  ventasSinCosto: 0,
});

export function armarBalance(
  movimientos: MovimientoDelBalance[],
  saldos: SaldosDelBalance,
): Balance {
  let ventas = 0;
  let recuperacion = 0;
  let gastos = 0;
  let inversion = 0;
  let recaudo = 0;
  let pagosAProveedores = 0;
  let ventasSinCosto = 0;

  const locales = new Map<string, BalanceDeUnLocal>();
  const delLocal = (localId: string | null): BalanceDeUnLocal | null => {
    // Sin local no se inventa uno: el arriendo de la bodega es de la tienda,
    // no de un punto. Suma al total y no aparece en el desglose.
    if (!localId) return null;
    const actual = locales.get(localId) ?? enCero(localId);
    locales.set(localId, actual);
    return actual;
  };

  for (const m of movimientos) {
    // Lo anulado devolvió mercancía y plata: contarlo infla las ventas y la
    // ganancia del mes al mismo tiempo.
    if (m.anulado) continue;
    const local = delLocal(m.localId);

    switch (m.tipo) {
      case 'VENTA': {
        ventas += m.centavos;
        if (local) local.ventas += m.centavos;
        if (m.costoCentavos === null) {
          ventasSinCosto += 1;
          if (local) local.ventasSinCosto += 1;
        } else {
          recuperacion += m.costoCentavos;
          if (local) local.recuperacion += m.costoCentavos;
        }
        break;
      }
      case 'GASTO': {
        gastos += m.centavos;
        if (local) local.gastos += m.centavos;
        break;
      }
      case 'COMPRA': {
        // Comprar mercancía no empobrece: cambia plata por inventario. En
        // gastos, un mes de reposición fuerte se leería como pérdida.
        inversion += m.centavos;
        if (local) local.inversion += m.centavos;
        break;
      }
      case 'ABONO': {
        recaudo += m.centavos;
        break;
      }
      case 'PAGO_PROVEEDOR': {
        pagosAProveedores += m.centavos;
        break;
      }
    }
  }

  for (const l of locales.values()) {
    l.ganancia = l.ventas - l.recuperacion;
    l.utilidadNeta = l.ganancia - l.gastos;
  }

  const ganancia = ventas - recuperacion;
  return {
    ventas,
    recuperacion,
    ganancia,
    gastos,
    inversion,
    // Puede quedar negativa, y se muestra negativa: recortarla a cero es
    // mentirle a quien tiene que decidir si cierra un local.
    utilidadNeta: ganancia - gastos,
    recaudo,
    pagosAProveedores,
    ventasSinCosto,
    inventario: saldos.inventarioCentavos,
    porCobrar: saldos.porCobrarCentavos,
    porPagar: saldos.porPagarCentavos,
    capital:
      saldos.inventarioCentavos +
      saldos.porCobrarCentavos -
      saldos.porPagarCentavos,
    margen: ventas === 0 ? 0 : Math.round((ganancia / ventas) * 1000) / 10,
    // Del que más vendió al que menos, que es lo primero que se mira. El
    // desempate por identificador mantiene el orden estable entre corridas:
    // una lista que se reordena sola al recargar hace dudar de los números.
    porLocal: [...locales.values()].sort(
      (a, b) => b.ventas - a.ventas || a.localId.localeCompare(b.localId),
    ),
  };
}
