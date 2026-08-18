import { MovementType } from '../common/enums/movement-type.enum.js';

/**
 * Cuánto sumó o restó un movimiento al inventario.
 *
 * **La columna `quantity` no trae un signo confiable.** Las ventas guardan la
 * salida en negativo (`OUT −8`) y el ajuste rápido desde Productos guarda la
 * misma salida en positivo (`OUT 9`), porque `adjustStock` escribe
 * `quantity: dto.quantity` tal cual y es el `switch` el que resta. Sumar la
 * columna da un número sin sentido, y una tienda que revise su historial va a
 * creer que le entró mercancía donde le salió.
 *
 * Por eso el signo se deduce del **tipo**, que sí es confiable, y se ignora el
 * de la cantidad:
 *
 * - `IN` siempre suma, `OUT` siempre resta, sin importar cómo venga escrito.
 * - `TRANSFER` conserva su signo: el traslado escribe dos filas, negativa en
 *   la bodega de origen y positiva en la de destino, y ahí el signo sí
 *   significa algo.
 * - `ADJUSTMENT` es un caso aparte: no es un delta sino un **valor final**
 *   («el conteo quedó en 38»), así que no se puede sumar al saldo anterior.
 *   Devuelve `null` para que quien arme el historial lo trate como lo que es.
 */
export function movementDelta(
  movementType: MovementType,
  quantity: number,
): number | null {
  const magnitud = Math.abs(quantity);
  switch (movementType) {
    case MovementType.IN:
      return magnitud;
    case MovementType.OUT:
      return -magnitud;
    case MovementType.TRANSFER:
      return quantity;
    case MovementType.ADJUSTMENT:
      return null;
    default:
      return null;
  }
}

/** Un movimiento fija el saldo en vez de moverlo. */
export function isAbsoluteMovement(movementType: MovementType): boolean {
  return movementType === MovementType.ADJUSTMENT;
}

/**
 * Reconstruye el saldo después de cada movimiento, del más viejo al más nuevo.
 *
 * Se calcula hacia adelante desde el saldo inicial y no hacia atrás desde el
 * stock de hoy: un `ADJUSTMENT` corta la cadena —fija el saldo y borra lo que
 * venía antes— y hacia atrás no hay forma de atravesarlo.
 */
export function runningBalance<
  T extends { movementType: MovementType; quantity: number },
>(movimientos: T[], saldoInicial = 0): (T & { delta: number | null; balance: number })[] {
  let saldo = saldoInicial;
  return movimientos.map((m) => {
    const delta = movementDelta(m.movementType, m.quantity);
    if (delta === null) {
      // El ajuste dice en cuánto quedó: se obedece.
      saldo = Math.abs(m.quantity);
    } else {
      saldo += delta;
    }
    return { ...m, delta, balance: saldo };
  });
}
