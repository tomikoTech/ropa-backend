/**
 * Cuándo un movimiento de inventario se frena por falta de existencias.
 *
 * Suena a una comparación de una línea, y por eso estuvo mal: **hay saldos
 * negativos a propósito**. En una perfumería la venta de la loción no se
 * detiene porque falte el envase; el frasco queda debiendo y ese número en
 * rojo es el aviso de reponer (`pos.service.ts`, `permitirNegativo`). Lo mismo
 * pasa cuando el cajero escanea un par cuya etiqueta está en otra bodega.
 *
 * El error era preguntar solo «¿el saldo queda negativo?». Con el frasco en
 * −17, **anular una venta** —que devuelve envases— quedaba prohibido para
 * siempre: el saldo seguía negativo después de devolver, así que la tienda no
 * podía deshacer nada. El mensaje lo delataba: «hay −17 y se intentan sacar
 * −4». Nadie saca −4; eso era una devolución disfrazada de salida.
 *
 * La pregunta correcta es **si el movimiento saca algo**. Devolver, reponer o
 * dejar igual no puede rechazarse nunca, ni aunque el saldo siga en rojo: el
 * rojo ya estaba ahí y devolver lo mejora.
 */
export interface Movimiento {
  /** El saldo antes de mover. Puede ser negativo. */
  antes: number;
  /** El saldo que quedaría. */
  despues: number;
  /** Quien mueve acepta dejarlo debiendo (el frasco, el par escaneado). */
  permitirNegativo?: boolean;
}

export type Veredicto =
  | { permitido: true }
  | { permitido: false; porque: string };

/** Cuánto saca este movimiento. Cero o negativo si no saca nada. */
export function loQueSaca(m: Movimiento): number {
  return Math.max(0, m.antes - m.despues);
}

export function alcanzaElInventario(m: Movimiento): Veredicto {
  // Devolver, reponer o dejar igual: no hay nada que alcanzar.
  if (loQueSaca(m) === 0) return { permitido: true };
  if (m.permitirNegativo) return { permitido: true };
  if (m.despues >= 0) return { permitido: true };

  return {
    permitido: false,
    porque: `No hay suficiente inventario: hay ${m.antes} y se intentan sacar ${loQueSaca(
      m,
    )}.`,
  };
}
