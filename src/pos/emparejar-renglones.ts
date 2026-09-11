/**
 * A qué renglón anterior corresponde cada renglón que llega al editar la venta.
 *
 * Editar una factura la reemplaza entera: llegan los renglones nuevos y hay que
 * decidir cuál de los viejos es «el mismo», para heredarle el IVA, el costo y
 * —lo que importa acá— **su código físico**, la caja o el par que el cliente se
 * lleva.
 *
 * Se emparejaba por variante y cantidad. Con una factura de cincuenta y tres
 * cajas de la misma referencia eso es cincuenta y tres renglones idénticos, así
 * que el emparejamiento quedaba a merced del orden y le entregaba a un renglón
 * el código de otro. Pasó de verdad, el 11 de septiembre: al anexar la caja
 * cincuenta y cuatro, un renglón se quedó con el código que otro venía a pedir,
 * y ese otro murió con «el código 26091100020010347 ya no está disponible».
 * Siete intentos seguidos, todos iguales. Al vendedor le tocó armar otra venta.
 *
 * **El código es la identidad del renglón.** Quien pide una caja concreta se
 * empareja con el renglón que la tenía, esté donde esté en la lista. Solo lo
 * que no pide código —o pide uno que la venta no tenía, que es justo el caso de
 * lo que se está anexando— cae al emparejamiento por variante y cantidad.
 *
 * Y quien pidió un código que ningún renglón anterior traía **no hereda el
 * código de nadie**: heredar ahí es robárselo a su dueño, que es como el bug
 * anterior se volvía permanente.
 */

/** Un renglón que llega en la edición. */
export interface RenglonPedido {
  variantId: string;
  quantity: number;
  stockUnitIds?: string[];
}

/** Un renglón que la venta ya tenía. */
export interface RenglonAnterior {
  variantId: string;
  quantity: number;
  stockUnitId?: string | null;
}

export interface Emparejamiento {
  /** Índice en `anteriores`, o `null` si este renglón es nuevo. */
  anterior: number | null;
  /**
   * Si este renglón puede quedarse con el código del anterior.
   *
   * Falso cuando el anterior se le asignó solo por variante y cantidad pero
   * este renglón venía pidiendo otro bulto: el suyo lo resuelve el inventario
   * con `stockUnitIds`.
   */
  conservaElCodigo: boolean;
}

export function emparejarRenglones(
  pedidos: RenglonPedido[],
  anteriores: RenglonAnterior[],
): Emparejamiento[] {
  const libres = anteriores.map((_, i) => i);
  const salida: (Emparejamiento | null)[] = pedidos.map(() => null);

  const tomar = (posicion: number): number => libres.splice(posicion, 1)[0];

  // 1) Por código. Primero, porque es la única señal que distingue de verdad
  //    dos renglones de la misma referencia y la misma cantidad.
  pedidos.forEach((pedido, i) => {
    const codigos = pedido.stockUnitIds ?? [];
    if (!codigos.length) return;
    const posicion = libres.findIndex((j) => {
      const anterior = anteriores[j];
      return !!anterior.stockUnitId && codigos.includes(anterior.stockUnitId);
    });
    if (posicion < 0) return;
    salida[i] = { anterior: tomar(posicion), conservaElCodigo: true };
  });

  // 2) Los demás, por variante y cantidad —y si no, por variante sola, que
  //    basta para heredar el IVA y el nombre aunque el código ya no aplique.
  pedidos.forEach((pedido, i) => {
    if (salida[i]) return;
    let posicion = libres.findIndex(
      (j) =>
        anteriores[j].variantId === pedido.variantId &&
        Number(anteriores[j].quantity) === Number(pedido.quantity),
    );
    if (posicion < 0) {
      posicion = libres.findIndex(
        (j) => anteriores[j].variantId === pedido.variantId,
      );
    }
    if (posicion < 0) {
      salida[i] = { anterior: null, conservaElCodigo: false };
      return;
    }
    const j = tomar(posicion);
    // Pidió un bulto que la venta no tenía: se está anexando. Hereda los
    // snapshots, nunca el código.
    const pidioOtro = (pedido.stockUnitIds ?? []).length > 0;
    salida[i] = {
      anterior: j,
      conservaElCodigo:
        !pidioOtro && Number(anteriores[j].quantity) === Number(pedido.quantity),
    };
  });

  return salida.map((e) => e ?? { anterior: null, conservaElCodigo: false });
}
