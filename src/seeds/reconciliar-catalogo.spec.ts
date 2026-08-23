import {
  ajustesDeStock,
  variantesQueFaltan,
} from './reconciliar-catalogo.util.js';

/**
 * Poner al día un producto que MiPinta ya tiene, contra lo que dice demachine.
 *
 * demachine es la fuente de verdad para AMAWAD y Sportcali. Pero los
 * importadores solo **creaban** productos nuevos: a uno que ya existía no le
 * agregaban las tallas que hubieran aparecido después. Por eso trece códigos
 * físicos de AMAWAD no encontraban dónde colgarse —«no existe variante para
 * talla 40 y color BLANCO»— aunque demachine tuviera esas tallas con
 * existencia.
 *
 * Las dos decisiones viven acá y se prueban sin base de datos: cuáles tallas
 * faltan, y cuánto hay que mover para que el saldo quede en lo que dice la
 * fuente.
 */

describe('variantesQueFaltan', () => {
  it('devuelve solo las que no están', () => {
    const faltan = variantesQueFaltan(
      [{ sizeId: '40', colorId: 'blanco' }],
      [
        { sizeId: '40', colorId: 'blanco' },
        { sizeId: '41', colorId: 'blanco' },
      ],
    );
    expect(faltan).toEqual([{ sizeId: '41', colorId: 'blanco' }]);
  });

  it('no repite una talla que aparece dos veces en la fuente', () => {
    // El export trae una fila por bodega: la misma talla sale varias veces y
    // crearla dos veces rompería el índice único del SKU.
    const faltan = variantesQueFaltan(
      [],
      [
        { sizeId: '41', colorId: 'blanco' },
        { sizeId: '41', colorId: 'blanco' },
      ],
    );
    expect(faltan).toHaveLength(1);
  });

  it('la talla sin color y el color sin talla son variantes distintas', () => {
    // Un accesorio de talla única con dos colores, y un zapato de una talla
    // sin color registrado: si se mezclaran, uno pisaría al otro.
    const faltan = variantesQueFaltan(
      [{ sizeId: null, colorId: 'negro' }],
      [
        { sizeId: null, colorId: 'negro' },
        { sizeId: '40', colorId: null },
        { sizeId: null, colorId: null },
      ],
    );
    expect(faltan).toEqual([
      { sizeId: '40', colorId: null },
      { sizeId: null, colorId: null },
    ]);
  });

  it('no confunde dos variantes que juntas se escriben igual', () => {
    // Sin un separador entre talla y color, `talla 4 / color 0` y
    // `talla 40 / sin color` son la misma cadena, y la segunda no se crearía.
    // Los ids son uuid en producción, pero la regla no puede depender de eso.
    const faltan = variantesQueFaltan(
      [{ sizeId: '4', colorId: '0' }],
      [{ sizeId: '40', colorId: null }],
    );
    expect(faltan).toEqual([{ sizeId: '40', colorId: null }]);
  });

  it('si no falta ninguna, no propone nada', () => {
    expect(
      variantesQueFaltan(
        [{ sizeId: '40', colorId: 'blanco' }],
        [{ sizeId: '40', colorId: 'blanco' }],
      ),
    ).toEqual([]);
  });

  it('conserva el orden de la fuente, para que dos corridas hagan lo mismo', () => {
    const faltan = variantesQueFaltan(
      [],
      [
        { sizeId: '43', colorId: 'x' },
        { sizeId: '40', colorId: 'x' },
      ],
    );
    expect(faltan.map((v) => v.sizeId)).toEqual(['43', '40']);
  });
});

describe('ajustesDeStock', () => {
  const clave = (v: string, w: string) => `${v}|${w}`;

  it('propone la diferencia, no el total', () => {
    // Escribir el total pisaría movimientos que la tienda hizo en MiPinta y
    // que la fuente no conoce; la diferencia deja rastro de qué se movió.
    const ajustes = ajustesDeStock(
      new Map([[clave('v1', 'w1'), 3]]),
      new Map([[clave('v1', 'w1'), 8]]),
    );
    expect(ajustes).toEqual([
      { variantId: 'v1', warehouseId: 'w1', desde: 3, hasta: 8, delta: 5 },
    ]);
  });

  it('lo que ya cuadra no se toca', () => {
    // Un movimiento de cero ensucia el historial con entradas que no entraron.
    expect(
      ajustesDeStock(
        new Map([[clave('v1', 'w1'), 5]]),
        new Map([[clave('v1', 'w1'), 5]]),
      ),
    ).toEqual([]);
  });

  it('baja lo que sobra', () => {
    const ajustes = ajustesDeStock(
      new Map([[clave('v1', 'w1'), 9]]),
      new Map([[clave('v1', 'w1'), 4]]),
    );
    expect(ajustes[0].delta).toBe(-5);
  });

  it('lo que la fuente ya no menciona se baja a cero', () => {
    // Una talla que se agotó en demachine y sigue con saldo en MiPinta es la
    // mitad del descuadre: si no se toca, nunca cuadran.
    const ajustes = ajustesDeStock(
      new Map([[clave('v1', 'w1'), 4]]),
      new Map(),
    );
    expect(ajustes).toEqual([
      { variantId: 'v1', warehouseId: 'w1', desde: 4, hasta: 0, delta: -4 },
    ]);
  });

  it('lo que está en cero de los dos lados no genera movimiento', () => {
    expect(
      ajustesDeStock(new Map([[clave('v1', 'w1'), 0]]), new Map()),
    ).toEqual([]);
  });

  it('una talla nueva entra desde cero', () => {
    const ajustes = ajustesDeStock(
      new Map(),
      new Map([[clave('v2', 'w1'), 6]]),
    );
    expect(ajustes).toEqual([
      { variantId: 'v2', warehouseId: 'w1', desde: 0, hasta: 6, delta: 6 },
    ]);
  });

  it('el orden es fijo: dos corridas proponen lo mismo', () => {
    const ajustes = ajustesDeStock(
      new Map(),
      new Map([
        [clave('zeta', 'w1'), 1],
        [clave('alfa', 'w1'), 1],
      ]),
    );
    expect(ajustes.map((a) => a.variantId)).toEqual(['alfa', 'zeta']);
  });
});
