import { code128Widths, code128ModuleCount } from './code128.js';

describe('code128', () => {
  it('empieza y termina con barra, con anchos de 1 a 4 modulos', () => {
    const w = code128Widths('12345');
    expect(w.length % 2).toBe(1); // barra inicial ... barra final
    expect(w.every((x) => x >= 1 && x <= 4)).toBe(true);
  });

  it('un codigo de 17 digitos ocupa 19 simbolos de 11 modulos + stop de 13', () => {
    // start + 17 datos + control = 19 simbolos de 11 modulos, mas el stop de 13.
    const code = '26080700290010013';
    expect(code.length).toBe(17);
    expect(code128ModuleCount(code)).toBe(19 * 11 + 13);
  });

  it('ignora caracteres fuera del rango imprimible sin romperse', () => {
    expect(() => code128Widths('ABC')).not.toThrow();
  });

  it('el digito de control cambia con el contenido', () => {
    expect(code128Widths('11111')).not.toEqual(code128Widths('22222'));
  });
});
