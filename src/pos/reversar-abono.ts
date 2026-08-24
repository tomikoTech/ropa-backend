/**
 * Deshacer un abono de cartera.
 *
 * Anular una venta a crédito con abonos se rechaza a propósito —«la plata
 * existe y hay que decidirla a mano»— y el mensaje pide *«reversa los abonos
 * antes de anularla»*. El problema, encontrado recorriendo el flujo el 23 de
 * agosto, es que **reversar un abono no existía**: ni botón, ni endpoint. El
 * sistema pedía algo que no se podía hacer por ninguna vía, y una venta a
 * crédito ya abonada quedaba imposible de anular para siempre.
 *
 * **No se borra: se compensa.** El abono entró un día y el cuadre de caja de
 * ese día ya lo contó. Borrarlo —o marcarlo y esconderlo— reescribiría un día
 * que puede estar cerrado. Un contra-abono con el monto en negativo y **su
 * propia fecha** deja el día original intacto y descuenta el de hoy, que es
 * donde de verdad salió la plata del cajón. Los dos renglones quedan a la
 * vista, que es lo que un dueño necesita para entender qué pasó.
 *
 * Un contra-abono no se puede reversar: para eso está volver a abonar.
 */

export interface AbonoParaReversar {
  id: string;
  /** Centavos. Negativo si ya es un contra-abono. */
  centavos: number;
  /** El abono que este renglón compensa, si es un contra-abono. */
  reversaA?: string | null;
}

export type ResultadoDeReversa =
  | { ok: false; motivo: string }
  | {
      ok: true;
      /** Lo que hay que guardar: el monto del contra-abono, en negativo. */
      centavosDelContra: number;
      /** Lo abonado que queda en la cuenta, después de compensar. */
      abonadoQueQueda: number;
    };

export function reversarAbono(params: {
  abonos: AbonoParaReversar[];
  abonoId: string;
}): ResultadoDeReversa {
  const { abonos, abonoId } = params;
  const abono = abonos.find((a) => a.id === abonoId);
  if (!abono) {
    return { ok: false, motivo: 'Ese abono no existe en esta cuenta.' };
  }
  // El signo es la marca: un contra-abono siempre nace en negativo, así que
  // preguntar además por `reversaA` aquí sería una guarda que no puede
  // dispararse. Y el signo cubre además los renglones negativos que llegaron
  // por importación, sin marca ninguna.
  if (abono.centavos < 0) {
    return {
      ok: false,
      motivo:
        'Ese renglón ya es una reversa. Para volver a cobrar, registra un abono nuevo.',
    };
  }
  const yaReversado = abonos.some((a) => a.reversaA === abonoId);
  if (yaReversado) {
    return { ok: false, motivo: 'Ese abono ya fue reversado.' };
  }

  const abonadoActual = abonos.reduce((suma, a) => suma + a.centavos, 0);
  return {
    ok: true,
    centavosDelContra: -abono.centavos,
    // Nunca por debajo de cero: un saldo abonado negativo no significa nada y
    // haría que la cuenta se leyera como si el cliente tuviera crédito a favor.
    abonadoQueQueda: Math.max(0, abonadoActual - abono.centavos),
  };
}
