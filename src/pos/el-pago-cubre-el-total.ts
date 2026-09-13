/**
 * ¿Alcanza lo que el cliente pagó para cubrir la venta?
 *
 * Parece una resta y no lo es. Un vendedor de AMAWAD no pudo cobrar una venta
 * con **33% de descuento** y el sistema le contestaba algo que no se puede ni
 * leer en voz alta:
 *
 *     Pago insuficiente. Total: $30753, Pagado: $30752.999999999996
 *
 * Nadie le debía cuatro billonésimas de peso a nadie. Lo que pasaba es que el
 * carrito y el servidor llegaban al mismo número por caminos distintos: el
 * carrito multiplicaba `precio × (1 - 33/100)` de un solo golpe, y el servidor
 * calculaba el descuento aparte y lo restaba, redondeando cada renglón a dos
 * decimales. En coma flotante esos dos caminos **no dan lo mismo**, y el que
 * daba menos era el del carrito. Comparados con `<` a pelo, la venta se caía.
 *
 * No era un caso raro: de 189 combinaciones de precio, cantidad y descuento,
 * **32 fallaban**, y entre ellas estaban 7% y 33%, que son de los descuentos
 * que más se usan en el mostrador.
 *
 * La regla, entonces: **la plata se compara en centavos enteros**. Es la misma
 * que ya gobierna `ar-allocation.ts` y `balance.ts`. Un centavo es la unidad
 * más chica que existe de verdad; por debajo de eso no hay deuda, hay ruido de
 * punto flotante.
 */

/** De pesos con decimales a centavos enteros. La única puerta de entrada. */
export function aCentavos(pesos: number): number {
  // `Math.round` y no `Math.trunc`: 30752.999999999996 son 3.075.300 centavos,
  // no 3.075.299. Truncar convertiría el ruido en un centavo de deuda real,
  // que es exactamente el problema que este módulo existe para no tener.
  return Math.round((Number(pesos) || 0) * 100);
}

/**
 * `true` si lo pagado alcanza para el total.
 *
 * Sin tolerancia extra a propósito: redondear a centavos **ya** es la
 * tolerancia. Sumarle encima «un pesito» dejaría pasar ventas realmente mal
 * cobradas, y eso sí es plata que falta en la caja.
 */
export function cubreElTotal(pagado: number, total: number): boolean {
  return aCentavos(pagado) >= aCentavos(total);
}

/**
 * `true` si el primer valor se pasa del segundo, ya en centavos.
 *
 * Para los topes —un descuento que no puede superar el subtotal, un abono que
 * no puede superar el saldo—, que sufren del mismo ruido por el otro lado.
 */
export function sePasaDe(valor: number, tope: number): boolean {
  return aCentavos(valor) > aCentavos(tope);
}
