/**
 * El código de un par **sale del código de su caja**.
 *
 *     caja   2 6 0 9 0 9 0 0 0 2 0 3 6 0 0 1 2
 *     par 5  2 6 0 9 0 9 0 0 0 2 0 3 6 0 0 1 2 | 0 5 | 7
 *            └──────── la caja, entera ───────┘ └par┘ └v┘
 *
 * Antes los pares se numeraban continuando el renglón de la caja: compartían
 * los trece primeros dígitos y salían justo después, pero **no había cómo
 * saber de un vistazo cuál venía de cuál**. Con tres cajas del mismo renglón,
 * el par 004 podía ser de cualquiera. La relación existía en la base
 * (`parentUnitId`) y no en el papel, que es donde se necesita: alguien con el
 * sticker en la mano, en la bodega, sin computador enfrente.
 *
 * Ahora el código de la caja está **completo y al principio**. Se lee, se
 * copia, se busca. Es lo que hacía el sistema anterior y por lo que la gente
 * lo pedía.
 *
 * No siempre se puede, y las dos excepciones importan:
 *
 * - Una caja con **código ajeno** —los importados de demachine son de 18
 *   dígitos y sin verificador— no puede prestar el suyo: sus dígitos no
 *   significan lo mismo y el resultado no sería verificable.
 * - Un par más allá del **99** no cabe en los dos dígitos. Pasa con cajas
 *   enormes y no puede frenar la apertura: una caja que no se abre deja la
 *   mercancía sin vender.
 *
 * En los dos casos el par se numera como antes (el reparto del renglón o el
 * del día). Sigue siendo el par correcto: lo que lo ata a su caja es
 * `parentUnitId`, no el número.
 */

import { calculateCheckDigit, isValidBarcode } from './barcode.util.js';

/** Cuántos pares de una caja caben en los dos dígitos del final. */
export const PARES_QUE_CABEN = 99;

/** Largo del código de una caja nuestra, con su verificador. */
const LARGO_DE_LA_CAJA = 17;

/** Si ese código es uno nuestro y puede prestar su numeración. */
export function esCodigoNuestro(codigo: string): boolean {
  return (
    typeof codigo === 'string' &&
    codigo.length === LARGO_DE_LA_CAJA &&
    /^\d+$/.test(codigo) &&
    isValidBarcode(codigo)
  );
}

/**
 * El código del par número `n` de esa caja, o `null` si no se puede derivar.
 *
 * `null` no es un error: es «numérelo como antes».
 */
export function codigoDelPar(
  codigoDeLaCaja: string,
  numeroDePar: number,
): string | null {
  const n = Math.trunc(numeroDePar);
  if (!Number.isFinite(n) || n < 1 || n > PARES_QUE_CABEN) return null;
  if (!esCodigoNuestro(codigoDeLaCaja)) return null;
  const cuerpo = codigoDeLaCaja + String(n).padStart(2, '0');
  return cuerpo + String(calculateCheckDigit(cuerpo));
}

/**
 * De qué caja es ese par, leyéndolo del propio código.
 *
 * Devuelve el código impreso de la caja, o `null` si ese par no lleva la caja
 * adentro (los de antes de este cambio, y los de código ajeno).
 */
export function cajaDelPar(codigoDelPar: string): string | null {
  if (typeof codigoDelPar !== 'string') return null;
  const limpio = codigoDelPar.trim();
  if (limpio.length !== LARGO_DE_LA_CAJA + 3) return null;
  if (!/^\d+$/.test(limpio)) return null;
  if (!isValidBarcode(limpio)) return null;
  const caja = limpio.slice(0, LARGO_DE_LA_CAJA);
  return esCodigoNuestro(caja) ? caja : null;
}

/** Qué número de par es, dentro de su caja. */
export function numeroDelPar(codigoDelPar: string): number | null {
  if (!cajaDelPar(codigoDelPar)) return null;
  const n = Number(codigoDelPar.trim().slice(LARGO_DE_LA_CAJA, LARGO_DE_LA_CAJA + 2));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Los códigos de los pares que salen de una caja, empezando en `desdeElPar`.
 *
 * Devuelve **solo los que se pudieron derivar**: si la caja no presta su
 * código, o si la tanda se pasa del 99, los que falten los numera quien llama
 * con el reparto de siempre.
 */
export function codigosDerivados(params: {
  codigoDeLaCaja: string;
  desdeElPar: number;
  cuantos: number;
}): string[] {
  const codigos: string[] = [];
  const cuantos = Math.max(0, Math.trunc(params.cuantos));
  for (let i = 0; i < cuantos; i++) {
    const codigo = codigoDelPar(params.codigoDeLaCaja, params.desdeElPar + i);
    if (!codigo) break;
    codigos.push(codigo);
  }
  return codigos;
}
