import { diaDeCalendario } from './dia-de-calendario.util.js';

/**
 * Cuándo una cuenta está vencida, y por cuántos días.
 *
 * La regla es la del mostrador, no la del reloj: **el día que vence todavía se
 * puede pagar**. Una cuenta pactada para el 25 no está en mora el 25; lo está
 * el 26, con un día.
 *
 * Antes se restaban milisegundos contra `Date.now()`, con dos consecuencias:
 * la cuenta salía «Vencida» en rojo desde la madrugada del mismo día en que se
 * había quedado de pagar, y el conteo se corría un día cada vez que en el
 * medio había un cambio de horario de verano.
 *
 * Acá no hay instantes: dos días de calendario se restan como días. Ver
 * `dia-de-calendario.util.ts`, que es la otra mitad del mismo criterio.
 *
 * **Dos guardas redundantes, dichas de frente.** `Date.UTC` y `Math.round`
 * protegen de lo mismo —una zona con horario de verano, donde la resta local
 * da 244,96 días en vez de 245— y cualquiera de las dos por separado ya da el
 * resultado correcto. Ninguna mutación de una sola la caza, y la mutación de
 * las dos juntas tampoco: jest congela la zona del proceso, así que dentro de
 * la suite no hay forma de reproducir un horario de verano. Se dejan las dos a
 * propósito y se dice, en vez de escribir una prueba que pase sin probar nada.
 */

const MS_POR_DIA = 86_400_000;

/** `AAAA-MM-DD` → el instante de su medianoche **en UTC**, solo para restar. */
function comoNumero(dia: string): number {
  const [y, m, d] = dia.split('-').map(Number);
  // UTC a propósito: la resta tiene que ser entre dos puntos de la misma
  // regla, sin que la zona del servidor meta una hora de por medio.
  return Date.UTC(y, m - 1, d);
}

/**
 * Días de mora de una cuenta: 0 si aún no vence, o si no hay plazo.
 *
 * `hoy` se recibe en vez de leerlo del reloj para que el cálculo sea el mismo
 * en una prueba y en producción.
 */
export function diasDeMora(
  vence: string | Date | null | undefined,
  hoy: string,
): number {
  if (vence === null || vence === undefined || vence === '') return 0;

  let dia: string;
  try {
    dia = diaDeCalendario(vence);
  } catch {
    // Se traga, al revés que al escribir: una fila vieja con la fecha
    // ilegible no puede dejar sin cartera a toda la tienda. Sale en cero y se
    // ve en la lista, que es como se descubre.
    return 0;
  }

  const corridos = Math.round((comoNumero(hoy) - comoNumero(dia)) / MS_POR_DIA);
  return corridos > 0 ? corridos : 0;
}

/** Si la cuenta ya pasó su plazo. El día pactado todavía no cuenta. */
export function estaVencida(
  vence: string | Date | null | undefined,
  hoy: string,
): boolean {
  return diasDeMora(vence, hoy) > 0;
}
