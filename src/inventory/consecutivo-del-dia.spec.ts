import {
  ConsecutivoAgotadoError,
  explicarConsecutivoAgotado,
  siguienteConsecutivoDelDia } from './consecutivo-del-dia.js';

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

/** Un código nuestro del 23 de agosto de 2026, renglón `n`, unidad 1. */
const nuestro = (n: number) => {
  const cuerpo = `260823${'0000'}${String(n).padStart(3, '0')}001`;
  let impar = 0;
  let par = 0;
  for (let i = 0; i < cuerpo.length; i++) {
    const d = Number(cuerpo[i]);
    if (i % 2 === 0) impar += d;
    else par += d;
  }
  return cuerpo + String((10 - ((impar + par * 3) % 10)) % 10);
};

const HOY = new Date(2026, 7, 23);

describe('siguienteConsecutivoDelDia', () => {
  it('sin nada del día, empieza en uno', () => {
    expect(siguienteConsecutivoDelDia([], HOY)).toBe(1);
  });

  it('sigue del mayor que haya', () => {
    expect(
      siguienteConsecutivoDelDia([nuestro(1), nuestro(7), nuestro(3)], HOY),
    ).toBe(8);
  });

  it('un código de demachine no empuja el consecutivo', () => {
    // La que importa: 18 dígitos y sin verificador. Si contara, leeríamos
    // «015» donde no hay ningún renglón 15 nuestro, y al pasar de 999 el
    // generador se queda sin poder crear etiquetas el resto del día.
    expect(
      siguienteConsecutivoDelDia([nuestro(2), '260823001500103702'], HOY),
    ).toBe(3);
  });

  it('uno de demachine que cae justo en nuestro prefijo tampoco', () => {
    // El caso incómodo: 18 dígitos que empiezan igual que los nuestros. El
    // filtro del prefijo no lo ve; lo que lo delata es el largo.
    const conNuestroPrefijo = '260823000001500102';
    expect(conNuestroPrefijo.startsWith('2608230000')).toBe(true);
    expect(siguienteConsecutivoDelDia([nuestro(2), conNuestroPrefijo], HOY)).toBe(
      3,
    );
  });

  it('uno con nuestro largo pero mal escrito tampoco', () => {
    // Un código dictado por teléfono y tecleado a mano: tiene nuestro largo y
    // nuestro prefijo, pero el verificador no da. Contarlo saltaría
    // consecutivos y acercaría el tope de 999 sin motivo.
    const bueno = nuestro(300);
    // Un dígito distinto del correcto, sea cual sea.
    const malEscrito =
      bueno.slice(0, -1) + String((Number(bueno.slice(-1)) + 1) % 10);
    expect(malEscrito).toHaveLength(17);
    expect(siguienteConsecutivoDelDia([nuestro(2), malEscrito], HOY)).toBe(3);
  });

  it('un código de otro día tampoco', () => {
    expect(siguienteConsecutivoDelDia([nuestro(5)], new Date(2026, 7, 24))).toBe(
      1,
    );
  });

  it('un código de otra sección del formato tampoco', () => {
    // Los que sí llevan orden de compra viven en otro tramo y tienen su propia
    // numeración; mezclarlos saltaría consecutivos sin motivo.
    const conOrden = nuestro(3).replace('260823' + '0000', '260823' + '0042');
    expect(siguienteConsecutivoDelDia([conOrden], HOY)).toBe(1);
  });

  it('basura no tumba el cálculo', () => {
    // Una fila vieja con un código a mano no puede dejar sin etiquetas a la
    // tienda entera.
    expect(
      siguienteConsecutivoDelDia(['', 'ABC', '123', nuestro(4)], HOY),
    ).toBe(5);
  });

  it('avisa antes de desbordar el formato', () => {
    // A partir de 999 no cabe. Reventar acá, con un mensaje que se entienda,
    // es mejor que armar un código de más dígitos que la pistola no lee.
    expect(() => siguienteConsecutivoDelDia([nuestro(999)], HOY)).toThrow(
      /999/,
    );
  });

  it('lo que lanza es reconocible, no un Error cualquiera', () => {
    // Quien llama tiene que poder distinguirlo para contestar 409 y no 500:
    // el vendedor veía «Error interno del servidor» cuando el sistema sabía
    // perfectamente qué había pasado y cómo salir.
    expect(() => siguienteConsecutivoDelDia([nuestro(999)], HOY)).toThrow(
      ConsecutivoAgotadoError,
    );
  });

  it('no da consejos: el consejo depende de quién esté ingresando', () => {
    // Decía «ingrésala por una orden de compra» siempre — incluso a quien
    // estaba recibiendo justamente una orden de compra, que es un consejo
    // imposible de seguir. El hecho lo dice la regla; el consejo, quien
    // conoce el origen.
    try {
      siguienteConsecutivoDelDia([nuestro(999)], HOY);
      throw new Error('debió lanzar');
    } catch (e) {
      expect(e).toBeInstanceOf(ConsecutivoAgotadoError);
      expect((e as Error).message).not.toMatch(/orden de compra/i);
    }
  });
});

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
