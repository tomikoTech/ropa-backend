import { repartirPorExclusion } from './codigos-fisicos.util.js';

/**
 * Qué filas se dejan fuera de la importación, y por qué eso se dice.
 *
 * Antes solo se podía excluir por **referencia**: `EXCLUDE_SOURCE_CODES=H20`
 * saca las diez filas de esa referencia. Cuando en 2.742 códigos de Sportcali
 * apareció **una sola** fila mala —un par sin talla, error de captura en
 * demachine—, las opciones eran tirar los diez pares buenos de esa referencia
 * o dejar los 2.741 sin importar, porque el guardián no deja aplicar con
 * conflictos.
 *
 * Ninguna de las dos es aceptable, y bajarle al guardián sí que no: importar
 * «casi todo» deja un inventario a medias que nadie sabe leer. Por eso ahora
 * se puede excluir **el código exacto**, con su razón escrita.
 */

const fila = (barcode: string, product_code: string | null) => ({
  barcode,
  product_code,
});

describe('repartirPorExclusion', () => {
  it('sin exclusiones, todo entra', () => {
    const { entran, quedanFuera } = repartirPorExclusion(
      [fila('111', 'A'), fila('222', 'B')],
      { referencias: [], codigos: [] },
    );
    expect(entran).toHaveLength(2);
    expect(quedanFuera).toHaveLength(0);
  });

  it('excluye un código exacto sin tocar los demás de su referencia', () => {
    // La que importa: un par sin talla no puede costar los otros nueve.
    const { entran, quedanFuera } = repartirPorExclusion(
      [fila('malo', 'H20'), fila('bueno', 'H20'), fila('otro', 'B11')],
      { referencias: [], codigos: ['malo'] },
    );
    expect(entran.map((f) => f.barcode)).toEqual(['bueno', 'otro']);
    expect(quedanFuera.map((f) => f.barcode)).toEqual(['malo']);
  });

  it('la exclusión por referencia sigue funcionando', () => {
    const { entran, quedanFuera } = repartirPorExclusion(
      [fila('a', 'H20'), fila('b', 'H20'), fila('c', 'B11')],
      { referencias: ['H20'], codigos: [] },
    );
    expect(entran.map((f) => f.barcode)).toEqual(['c']);
    expect(quedanFuera).toHaveLength(2);
  });

  it('las dos formas se suman, sin contar dos veces', () => {
    // Un código que además está en una referencia excluida sale una sola vez;
    // duplicarlo haría que el conteo del reporte no cuadrara con las filas.
    const { entran, quedanFuera } = repartirPorExclusion(
      [fila('a', 'H20'), fila('b', 'B11')],
      { referencias: ['H20'], codigos: ['a'] },
    );
    expect(entran.map((f) => f.barcode)).toEqual(['b']);
    expect(quedanFuera).toHaveLength(1);
  });

  it('los espacios alrededor no cuentan', () => {
    // Lo que se pega desde una hoja de cálculo trae espacios.
    const { quedanFuera } = repartirPorExclusion([fila('  malo  ', 'H20')], {
      referencias: [],
      codigos: [' malo '],
    });
    expect(quedanFuera).toHaveLength(1);
  });

  it('una entrada vacía en la lista no excluye a todo el mundo', () => {
    // `EXCLUDE_SOURCE_CODES=H20,` deja una cadena vacía al separar por comas.
    // Sin descartarla, coincidiría con toda fila sin referencia y la
    // importación se vaciaría sin que nadie lo pidiera.
    // Se prueba también con una fila cuyo código viene vacío —dato malo de la
    // fuente—: es la única que la cadena vacía podría alcanzar.
    const { entran, quedanFuera } = repartirPorExclusion(
      [fila('x', null), fila('y', ''), fila('', 'H20')],
      { referencias: ['', '  '], codigos: ['', '  '] },
    );
    expect(entran).toHaveLength(3);
    expect(quedanFuera).toHaveLength(0);
  });

  it('una fila sin referencia no la excluye ninguna referencia', () => {
    const { entran } = repartirPorExclusion([fila('x', null)], {
      referencias: ['H20'],
      codigos: [],
    });
    expect(entran).toHaveLength(1);
  });
});
