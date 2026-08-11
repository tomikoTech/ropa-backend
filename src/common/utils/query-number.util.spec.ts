import { parseNonNegativeInt, parsePositiveInt } from './query-number.util.js';

describe('números que llegan por la URL', () => {
  it('deja pasar un número normal', () => {
    expect(parsePositiveInt('30')).toBe(30);
    expect(parseNonNegativeInt('0')).toBe(0);
  });

  it('trata la basura como "no lo mandaron", no como NaN', () => {
    // `Number('abc')` es NaN, y un NaN dentro de un `take` es una consulta rota.
    for (const valor of ['abc', '', ' ', undefined, null]) {
      expect(parsePositiveInt(valor)).toBeUndefined();
    }
  });

  it('rechaza cero y negativos donde no tienen sentido', () => {
    expect(parsePositiveInt('0')).toBeUndefined();
    expect(parsePositiveInt('-5')).toBeUndefined();
    expect(parseNonNegativeInt('-1')).toBeUndefined();
  });

  it('recorta al tope: la URL no decide cuánta base se lee', () => {
    expect(parsePositiveInt('999999', { max: 200 })).toBe(200);
    expect(parsePositiveInt('50', { max: 200 })).toBe(50);
  });

  it('trunca los decimales en vez de arrastrarlos a la consulta', () => {
    expect(parsePositiveInt('12.9')).toBe(12);
  });

  it('no se traga el infinito', () => {
    expect(parsePositiveInt('Infinity')).toBeUndefined();
  });
});
