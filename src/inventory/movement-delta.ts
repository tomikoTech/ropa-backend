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

/**
 * El signo con el que hay que **guardar** una cantidad.
 *
 * La convención es: el signo dice el efecto sobre el inventario. `TRANSFER` ya
 * la seguía —negativo en la bodega de origen, positivo en la de destino— y era
 * `OUT` el que no: ocho de los diez lugares que registran una salida la
 * escribían en positivo y dejaban que el `switch` de turno hiciera la resta.
 *
 * Se aplica en `@BeforeInsert` de la entidad y no en cada llamada, para que un
 * módulo nuevo no tenga que acordarse: es el mismo criterio con el que acá los
 * permisos se deducen de la ruta y las bodegas se detectan en el guard.
 */
export function normalizeStoredQuantity(
  movementType: MovementType,
  quantity: number,
): number {
  const magnitud = Math.abs(quantity);
  switch (movementType) {
    case MovementType.IN:
      return magnitud;
    case MovementType.OUT:
      // `|| 0` para no devolver `-0`: Postgres lo guarda como 0, pero deja
      // pasar un valor que se compara raro en cualquier prueba.
      return -magnitud || 0;
    case MovementType.TRANSFER:
      // Acá el signo lo pone quien crea el par de filas y sí significa algo:
      // forzarlo borraría de cuál bodega salió.
      return quantity;
    case MovementType.ADJUSTMENT:
      // No es un delta sino el conteo final, y un conteo no es negativo.
      return magnitud;
    default:
      return quantity;
  }
}

/**
 * Los dos extremos de un día `YYYY-MM-DD`, en la hora del servidor.
 *
 * `new Date('2026-08-18')` se interpreta como **medianoche UTC**, que en
 * Colombia (UTC−5) son las 7 de la tarde del 17. Con eso, «hasta el 18»
 * terminaba a las 23:59 del 17 y el día entero quedaba afuera del filtro: la
 * tienda buscaba los movimientos de hoy y la pantalla salía vacía.
 *
 * Por eso la fecha se parte en números y se arma con el constructor de tres
 * argumentos, que sí construye en hora local.
 */
function partesDeFecha(fecha: string): [number, number, number] | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha.trim());
  if (!m) return null;
  return [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
}

/** Las 00:00:00.000 de esa fecha, hora local. */
export function desdeInicioDelDia(fecha: string): Date {
  const partes = partesDeFecha(fecha);
  if (!partes) return new Date(fecha);
  const [a, mes, d] = partes;
  return new Date(a, mes, d, 0, 0, 0, 0);
}

/** Las 23:59:59.999 de esa fecha, hora local. */
export function hastaFinDelDia(fecha: string): Date {
  const partes = partesDeFecha(fecha);
  if (!partes) return new Date(fecha);
  const [a, mes, d] = partes;
  return new Date(a, mes, d, 23, 59, 59, 999);
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
