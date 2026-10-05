/**
 * Corregir **cómo** entró un abono, sin tocar cuánto.
 *
 * Los 643 abonos de Distri Amber se cargaron desde un Excel que no decía el
 * medio de pago: quedaron todos como EFECTIVO y sin banco. Andrea pregunta
 * «¿dónde digito si pagaron en efectivo o en transferencia, y que coincidan
 * con los movimientos del banco?». Tesorería suma los abonos por método y
 * banco, así que basta con poder corregir esos dos datos (y el número del
 * recibo) para que los saldos del banco cuadren.
 *
 * Lo que **no** se corrige acá es el monto: cambiarlo reescribiría el cuadre
 * del día en que entró la plata. Para eso está deshacer el abono y volverlo
 * a registrar, que deja los dos renglones a la vista.
 */

export type MetodoDeAbono = 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA';

export interface AbonoACorregir {
  /** Centavos. Negativo si es un contra-abono. */
  centavos: number;
  /** El abono que este renglón compensa, si es un contra-abono. */
  reversaA: string | null;
  /** Ya le pusieron su contra-abono: la plata ya no cuenta. */
  reversado: boolean;
  metodo: string;
  bankId: string | null;
  reference: string | null;
  notes: string | null;
}

export interface CorreccionDelAbono {
  metodo?: MetodoDeAbono;
  /** `null` quita el banco. `undefined` no lo toca. */
  bankId?: string | null;
  reference?: string | null;
  notes?: string | null;
}

export type ResultadoDeCorreccion =
  | { ok: false; motivo: string }
  | {
      ok: true;
      cambios: {
        metodo: string;
        bankId: string | null;
        reference: string | null;
        notes: string | null;
      };
    };

/** Con qué medio la plata pasa por un banco. */
export function llevaBanco(metodo: string): boolean {
  return metodo === 'TARJETA' || metodo === 'TRANSFERENCIA';
}

export function corregirAbono(params: {
  abono: AbonoACorregir;
  correccion: CorreccionDelAbono;
  /** Cuántos bancos activos tiene la tienda. Sin bancos, no se exige uno. */
  bancosActivos: number;
}): ResultadoDeCorreccion {
  const { abono, correccion, bancosActivos } = params;
  // El signo es la marca del contra-abono (igual que al reversar): un renglón
  // en negativo no es plata que entró, es plata que se devolvió.
  if (abono.centavos < 0 || abono.reversaA) {
    return {
      ok: false,
      motivo:
        'Ese renglón deshace otro abono: no se corrige. Corrige el abono original antes de deshacerlo, o registra uno nuevo.',
    };
  }
  if (abono.reversado) {
    return {
      ok: false,
      motivo:
        'Ese abono ya fue deshecho: ya no cuenta. Registra el abono de nuevo con el método correcto.',
    };
  }

  const metodo = correccion.metodo ?? abono.metodo;
  if (!['EFECTIVO', 'TARJETA', 'TRANSFERENCIA'].includes(metodo)) {
    return {
      ok: false,
      motivo: 'Un abono se corrige a efectivo, tarjeta o transferencia.',
    };
  }
  // En efectivo no hay banco: uno que quedó de antes se quita, para que el
  // saldo del banco no cuente plata que está en el cajón.
  let bankId: string | null = llevaBanco(metodo)
    ? correccion.bankId === undefined
      ? abono.bankId
      : correccion.bankId
    : null;
  if (llevaBanco(metodo) && bancosActivos > 0 && !bankId) {
    return {
      ok: false,
      motivo:
        'Di a qué banco entró: sin eso la transferencia no se refleja en ningún saldo.',
    };
  }
  if (!llevaBanco(metodo)) bankId = null;

  return {
    ok: true,
    cambios: {
      metodo,
      bankId,
      reference:
        correccion.reference === undefined
          ? abono.reference
          : correccion.reference?.trim() || null,
      notes:
        correccion.notes === undefined
          ? abono.notes
          : correccion.notes?.trim() || null,
    },
  };
}
