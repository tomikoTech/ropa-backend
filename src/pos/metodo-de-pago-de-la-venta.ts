/**
 * Corregir con qué se pagó una venta que ya está hecha.
 *
 * Se cobró en efectivo y era a crédito. Se anotó crédito y el cliente pagó por
 * transferencia. Pasa a diario y hasta ahora no había forma de arreglarlo: la
 * edición de la venta cambia renglones, cantidades y precios, pero el método de
 * pago no vive en la venta —vive en la fila de `payments`, o en la cuenta por
 * cobrar cuando es a crédito—, y ninguna de las dos se podía tocar. La única
 * salida era anular la factura y volver a hacerla, con su inventario y su
 * número de por medio.
 *
 * Este módulo decide **qué hay que mover** para que el cambio sea cierto, y
 * dice que no cuando no puede serlo. No toca la base de datos: eso lo hace el
 * servicio con el plan en la mano.
 *
 * Los importes van en **centavos enteros**: el método de pago decide a qué
 * columna del cuadre entra la plata, y un peso perdido al redondear ahí se
 * convierte en un descuadre que alguien tiene que buscar a mano.
 */

export interface PagoDeLaVenta {
  id: string;
  metodo: string;
  montoCentavos: number;
}

export interface CarteraDeLaVenta {
  id: string;
  totalCentavos: number;
  abonadoCentavos: number;
}

export interface CobroActual {
  totalCentavos: number;
  pagos: PagoDeLaVenta[];
  /** La cuenta por cobrar de esta venta, si tiene. Puede estar ya saldada. */
  cartera: CarteraDeLaVenta | null;
  /** `sale.isPaid`: una venta puede estar hecha y todavía sin cobrar. */
  cobrada: boolean;
  /** Con qué se dijo que se iba a pagar, cuando quedó pendiente. */
  intencion: string | null;
  /** Hay cliente de verdad (no el genérico de mostrador). */
  clienteRegistrado: boolean;
}

export interface CambioPedido {
  metodo: string;
  /** Obligatoria al pasar a crédito. */
  fechaDeVencimiento?: string | null;
}

export type PlanDelCambio =
  /** Ya estaba así. */
  | { hacer: 'nada'; porque: string }
  /** La venta sigue sin cobrarse: solo cambia con qué se piensa cobrar. */
  | { hacer: 'solo-la-intencion'; metodo: string }
  /** Entró la misma plata, por otra puerta. */
  | { hacer: 'cambiar-el-metodo-del-pago'; pagos: string[]; metodo: string }
  /** La plata nunca entró: se borra el pago y nace la deuda. */
  | {
      hacer: 'volverla-credito';
      pagosQueSeBorran: string[];
      /** Si la venta ya tuvo cartera, se revive esa fila en vez de crear otra. */
      carteraQueRevive: string | null;
      totalCentavos: number;
    }
  /** La deuda no existía: se salda la cartera y entra la plata. */
  | {
      hacer: 'cobrarla-ya';
      carteraQueSeSalda: string | null;
      metodo: string;
      totalCentavos: number;
    };

const CREDITO = 'CREDITO';

/** Una cartera cuenta como viva mientras deba algo. */
function carteraViva(cartera: CarteraDeLaVenta | null): boolean {
  return !!cartera && cartera.totalCentavos > 0;
}

/** Con qué figura pagada hoy esta venta. `null` si no figura de ninguna forma. */
export function metodoDeHoy(actual: CobroActual): string | null {
  if (carteraViva(actual.cartera)) return CREDITO;
  if (actual.pagos.length > 0) return actual.pagos[0].metodo;
  return actual.intencion;
}

function pesos(centavos: number): string {
  return `$${Math.round(centavos / 100).toLocaleString('es-CO')}`;
}

/**
 * El motivo por el que este cambio no se puede hacer, o `null` si sí se puede.
 *
 * Cada negativa dice qué hay que hacer antes. Un «no se puede» sin salida es
 * lo que obliga a anular la factura, que es justo lo que estamos evitando.
 */
export function porQueNoSePuedeCambiar(
  actual: CobroActual,
  pedido: CambioPedido,
): string | null {
  const metodos = new Set(actual.pagos.map((p) => p.metodo));
  if (metodos.size > 1) {
    return (
      'Esta venta se cobró con más de un método ' +
      `(${[...metodos].join(', ')}). Cambiarlo aquí los uniría en uno solo, ` +
      'y eso no es lo que pasó: corrígela desde los pagos de la venta.'
    );
  }

  // Mixta de verdad: parte cobrada, parte a crédito. No hay un método que
  // cambiar; hay dos, y decidir cuál manda sería inventarse la venta.
  if (carteraViva(actual.cartera) && actual.pagos.length > 0) {
    return (
      `Esta venta es mixta: ${pesos(sumaDeLosPagos(actual))} ya cobrados y ` +
      `${pesos(actual.cartera!.totalCentavos)} a crédito. Ajusta primero la ` +
      'cuenta por cobrar y vuelve.'
    );
  }

  if (pedido.metodo !== CREDITO && (actual.cartera?.abonadoCentavos ?? 0) > 0) {
    return (
      `Esta venta ya tiene ${pesos(actual.cartera!.abonadoCentavos)} abonados ` +
      'en cartera. Anula los abonos antes de sacarla del crédito.'
    );
  }

  if (pedido.metodo === CREDITO) {
    // Una cartera saldada que sí recibió abonos no se puede revivir: esos
    // abonos son plata que entró por la venta, y volverla a deber entera los
    // borraría del mapa. Abrir una segunda cuenta tampoco vale —la edición de
    // la venta ya no sabría cuál de las dos manda—.
    if (
      actual.cartera &&
      actual.cartera.totalCentavos === 0 &&
      actual.cartera.abonadoCentavos > 0
    ) {
      return (
        'Esta venta ya tuvo una cuenta por cobrar con ' +
        `${pesos(actual.cartera.abonadoCentavos)} abonados. Volverla a crédito ` +
        'requiere revisión manual de esos abonos.'
      );
    }
    if (!actual.clienteRegistrado) {
      return 'Las ventas a crédito requieren un cliente registrado (no genérico)';
    }
    if (!pedido.fechaDeVencimiento) {
      return 'Las ventas a crédito requieren fecha de vencimiento';
    }
  }

  return null;
}

function sumaDeLosPagos(actual: CobroActual): number {
  return actual.pagos.reduce((suma, p) => suma + p.montoCentavos, 0);
}

/**
 * Qué hay que mover. Solo se llama cuando `porQueNoSePuedeCambiar` dijo `null`.
 */
export function planDelCambio(
  actual: CobroActual,
  pedido: CambioPedido,
): PlanDelCambio {
  const hoy = metodoDeHoy(actual);
  const teniaCartera = carteraViva(actual.cartera);

  if (pedido.metodo === CREDITO) {
    if (teniaCartera) {
      return { hacer: 'nada', porque: 'La venta ya está a crédito.' };
    }
    return {
      hacer: 'volverla-credito',
      pagosQueSeBorran: actual.pagos.map((p) => p.id),
      carteraQueRevive:
        actual.cartera && actual.cartera.abonadoCentavos === 0
          ? actual.cartera.id
          : null,
      totalCentavos: actual.totalCentavos,
    };
  }

  if (teniaCartera) {
    return {
      hacer: 'cobrarla-ya',
      carteraQueSeSalda: actual.cartera!.id,
      metodo: pedido.metodo,
      totalCentavos: actual.totalCentavos,
    };
  }

  // Sin cartera y sin pagos: la venta está hecha pero nadie ha cobrado.
  if (actual.pagos.length === 0) {
    if (!actual.cobrada) {
      return hoy === pedido.metodo
        ? { hacer: 'nada', porque: 'La venta ya quedó con ese método.' }
        : { hacer: 'solo-la-intencion', metodo: pedido.metodo };
    }
    // Figura cobrada y no hay con qué: se cobra ahora, sin cartera que saldar.
    return {
      hacer: 'cobrarla-ya',
      carteraQueSeSalda: null,
      metodo: pedido.metodo,
      totalCentavos: actual.totalCentavos,
    };
  }

  if (hoy === pedido.metodo) {
    return { hacer: 'nada', porque: 'La venta ya quedó con ese método.' };
  }
  return {
    hacer: 'cambiar-el-metodo-del-pago',
    pagos: actual.pagos.map((p) => p.id),
    metodo: pedido.metodo,
  };
}
