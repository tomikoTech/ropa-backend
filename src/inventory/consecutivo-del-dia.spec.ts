import { explicarConsecutivoAgotado } from './consecutivo-del-dia.js';

/**
 * El consecutivo del día con el que se arma un código nuevo.
 *
 * Nuestro formato es `AAMMDD | orden(4) | renglón(3) | secuencia(3)` más el
 * dígito verificador: 17 dígitos. El de demachine son 18 y **no lleva
 * verificador** —se midió: solo el 9,5% de sus códigos pasa la comprobación
 * EAN, que es exactamente el azar—.
 *
 * Como las dos familias conviven en la misma tabla, el consecutivo se leía de
 * «cualquier código que empiece con la fecha de hoy y cuatro ceros», y de ahí
 * sacaba tres dígitos por posición. Un código ajeno que cayera en ese prefijo
 * empujaba el consecutivo hacia arriba, y al pasar de 999 el generador deja de
 * poder crear etiquetas **para el resto del día**.
 *
 * Por eso ahora solo cuentan los códigos que son nuestros: los que tienen
 * nuestro largo y pasan nuestro verificador.
 */



describe('explicarConsecutivoAgotado', () => {
  it('a quien recibe una compra le dice lo que sí puede hacer', () => {
    const mensaje = explicarConsecutivoAgotado('PURCHASE');
    expect(mensaje).toMatch(/999/);
    // Lo que NO puede hacer es «ingresarla por una orden de compra»: ya viene
    // por una.
    expect(mensaje).not.toMatch(/por una orden de compra/i);
    // Y le dice lo que de verdad le sirve saber: la orden no se pierde, queda
    // parcial y mañana se termina de recibir. Eso es lo que un mensaje
    // genérico no puede decirle.
    expect(mensaje).toMatch(/parcial/i);
    expect(mensaje).toMatch(/mañana/i);
  });

  it('lo mismo para las cajas de una compra', () => {
    expect(explicarConsecutivoAgotado('PURCHASE_BOX_LINE')).toBe(
      explicarConsecutivoAgotado('PURCHASE'),
    );
  });

  it('a quien ingresa sin orden sí le sirve el consejo', () => {
    const mensaje = explicarConsecutivoAgotado('STOCK_UNIT_INTAKE');
    expect(mensaje).toMatch(/por una orden de compra/i);
  });

  it('cualquier otro origen recibe el hecho, sin consejos que no apliquen', () => {
    const mensaje = explicarConsecutivoAgotado('ADJUSTMENT');
    expect(mensaje).toMatch(/999/);
    expect(mensaje).not.toMatch(/por una orden de compra/i);
  });
});
