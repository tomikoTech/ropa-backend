import { BARCODE_LIMITS, buildStockBarcode, isValidBarcode } from './barcode.util.js';

/**
 * El consecutivo del día con el que se arma un código nuevo.
 *
 * Nuestro formato es `AAMMDD | orden(4) | renglón(3) | secuencia(3)` más el
 * dígito verificador: **17 dígitos**. El de demachine son **18 y sin
 * verificador** —se midió sobre sus 3.224 códigos: solo el 9,5% pasa la
 * comprobación EAN, que es exactamente el azar—.
 *
 * Las dos familias conviven en la misma tabla, porque los códigos de demachine
 * son los que están **impresos en las cajas** y esos no se pueden cambiar. Los
 * nuestros son para la mercancía nueva, que lleva etiqueta nueva de todos
 * modos.
 *
 * El consecutivo se leía de «cualquier código que empiece con la fecha de hoy
 * y cuatro ceros», sacando tres dígitos por posición. Un código ajeno que
 * cayera en ese prefijo empujaba el número hacia arriba, y al pasar de 999 el
 * generador deja de poder crear etiquetas **para el resto del día**. Acá solo
 * cuentan los que son nuestros: nuestro largo y nuestro verificador.
 */

/** Los diez primeros dígitos de un código nuestro sin orden de compra. */
export function prefijoDelDia(fecha: Date): string {
  return buildStockBarcode({
    date: fecha,
    // Tramo reservado para lo que entra sin orden de compra.
    orderSequence: 0,
    lineConsecutive: 0,
    unitSequence: 0,
  }).slice(0, 10);
}

/** Largo de un código nuestro: 16 de cuerpo + el dígito verificador. */
const LARGO = 17;

export function siguienteConsecutivoDelDia(
  codigos: string[],
  fecha: Date,
): number {
  const prefijo = prefijoDelDia(fecha);
  let max = 0;
  for (const codigo of codigos) {
    if (codigo.length !== LARGO) continue;
    if (!codigo.startsWith(prefijo)) continue;
    // El verificador es lo que separa un código nuestro de uno que solo se le
    // parece: demachine no lo usa.
    if (!isValidBarcode(codigo)) continue;
    const n = Number(codigo.slice(10, 13));
    if (Number.isFinite(n) && n > max) max = n;
  }
  if (max >= BARCODE_LIMITS.line) {
    // Reventar acá, con un mensaje que se entienda, es mejor que armar un
    // código con un dígito de más que la pistola no lee.
    throw new Error(
      `Ya se usaron los ${BARCODE_LIMITS.line} consecutivos de hoy sin orden de compra. ` +
        'La mercancía que falta hay que ingresarla mañana o por una orden de compra.',
    );
  }
  return max + 1;
}
