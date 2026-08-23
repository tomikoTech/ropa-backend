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
    throw new ConsecutivoAgotadoError();
  }
  return max + 1;
}

/**
 * Se acabaron los consecutivos del día.
 *
 * Tiene tipo propio para que quien llama pueda distinguirlo: sin eso salía
 * como `Error` pelado y el filtro global lo convertía en **500 «Error interno
 * del servidor»**, justo cuando el sistema sabía exactamente qué había pasado.
 * Recibir una compra le contestaba eso al vendedor.
 *
 * El mensaje dice **el hecho y nada más**. El consejo depende de por dónde
 * esté entrando la mercancía, y quien conoce eso es quien llama —ver
 * `explicarConsecutivoAgotado`—.
 */
export class ConsecutivoAgotadoError extends Error {
  constructor() {
    super(
      `Ya se usaron los ${BARCODE_LIMITS.line} códigos que caben hoy en este tramo.`,
    );
    this.name = 'ConsecutivoAgotadoError';
  }
}

/**
 * El mismo hecho, con el consejo que sí aplica.
 *
 * Antes el mensaje decía siempre «ingrésala mañana o por una orden de compra».
 * A quien estaba **recibiendo una orden de compra** eso le pedía hacer lo que
 * ya estaba haciendo: un callejón sin salida con apariencia de ayuda.
 *
 * El tramo de 999 es el reservado para lo que entra con `orden = 0000`, y hoy
 * la recepción de una compra también consume de ahí (ver PENDIENTES B11): por
 * eso a esos dos orígenes lo único honesto que se les puede decir es que
 * esperen al día siguiente.
 */
export function explicarConsecutivoAgotado(motivo: string): string {
  const hecho = `Ya se usaron los ${BARCODE_LIMITS.line} códigos que caben hoy en este tramo.`;
  const vienePorOrden = motivo === 'PURCHASE' || motivo === 'PURCHASE_BOX_LINE';
  if (vienePorOrden) {
    return `${hecho} Lo que falte por etiquetar hay que recibirlo mañana; la orden queda parcial y se puede terminar de recibir.`;
  }
  if (motivo === 'STOCK_UNIT_INTAKE') {
    return `${hecho} La mercancía que falta se puede ingresar mañana, o hoy mismo por una orden de compra.`;
  }
  return `${hecho} Lo que falte hay que ingresarlo mañana.`;
}
