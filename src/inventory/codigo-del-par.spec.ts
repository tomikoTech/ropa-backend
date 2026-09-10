import {
  PARES_QUE_CABEN,
  cajaDelPar,
  codigoDelPar,
  codigosDerivados,
  esCodigoNuestro,
  numeroDelPar,
} from './codigo-del-par.js';
import { isValidBarcode, withCheckDigit } from './barcode.util.js';

// Una caja real de AMAWAD.
const CAJA = withCheckDigit('2609090002036001');

describe('el par lleva su caja adentro', () => {
  it('el código de la caja va completo y al principio', () => {
    const par = codigoDelPar(CAJA, 5)!;
    expect(par.startsWith(CAJA)).toBe(true);
    expect(par).toHaveLength(CAJA.length + 3);
    expect(par.slice(CAJA.length, CAJA.length + 2)).toBe('05');
  });

  it('el par se puede verificar como cualquier código nuestro', () => {
    // Es lo que hace que un lector descarte una lectura mal hecha.
    for (const n of [1, 7, 42, PARES_QUE_CABEN]) {
      expect(isValidBarcode(codigoDelPar(CAJA, n)!)).toBe(true);
    }
  });

  it('dos pares de la misma caja no se repiten', () => {
    const codigos = new Set(
      Array.from({ length: 24 }, (_, i) => codigoDelPar(CAJA, i + 1)),
    );
    expect(codigos.size).toBe(24);
  });

  it('dos cajas distintas no pueden dar el mismo par', () => {
    const otra = withCheckDigit('2609090002036002');
    expect(codigoDelPar(CAJA, 3)).not.toBe(codigoDelPar(otra, 3));
  });

  it('se lee de vuelta: de qué caja es y qué par', () => {
    const par = codigoDelPar(CAJA, 12)!;
    expect(cajaDelPar(par)).toBe(CAJA);
    expect(numeroDelPar(par)).toBe(12);
  });
});

describe('cuándo NO se deriva', () => {
  it('un código ajeno no presta el suyo', () => {
    // Los importados de demachine: 18 dígitos y sin verificador.
    expect(codigoDelPar('260423001500103224', 1)).toBeNull();
    expect(esCodigoNuestro('260423001500103224')).toBe(false);
  });

  it('un código con el verificador malo tampoco', () => {
    const roto = CAJA.slice(0, 16) + (Number(CAJA.slice(-1)) === 9 ? '8' : '9');
    expect(esCodigoNuestro(roto)).toBe(false);
    expect(codigoDelPar(roto, 1)).toBeNull();
  });

  it('pasado el 99 no cabe, y se dice devolviendo null', () => {
    // Una caja que no se puede abrir deja la mercancía sin vender: quien
    // llama numera el resto como antes.
    expect(codigoDelPar(CAJA, PARES_QUE_CABEN)).not.toBeNull();
    expect(codigoDelPar(CAJA, PARES_QUE_CABEN + 1)).toBeNull();
    expect(codigoDelPar(CAJA, 0)).toBeNull();
    expect(codigoDelPar(CAJA, -3)).toBeNull();
  });

  it('un par de antes de este cambio no dice de qué caja es', () => {
    // 17 dígitos: es el formato viejo, y mentir sería peor.
    expect(cajaDelPar('26090900020360029')).toBeNull();
    expect(numeroDelPar('26090900020360029')).toBeNull();
  });
});

describe('la tanda de una apertura', () => {
  it('numera desde donde va, para que una segunda tanda no repita', () => {
    const primera = codigosDerivados({
      codigoDeLaCaja: CAJA,
      desdeElPar: 1,
      cuantos: 3,
    });
    const segunda = codigosDerivados({
      codigoDeLaCaja: CAJA,
      desdeElPar: 4,
      cuantos: 2,
    });
    expect(primera).toHaveLength(3);
    expect(segunda).toHaveLength(2);
    expect(new Set([...primera, ...segunda]).size).toBe(5);
    expect(numeroDelPar(segunda[0])).toBe(4);
  });

  it('devuelve solo lo que cupo: el resto lo numera quien llama', () => {
    const codigos = codigosDerivados({
      codigoDeLaCaja: CAJA,
      desdeElPar: PARES_QUE_CABEN - 1,
      cuantos: 5,
    });
    expect(codigos).toHaveLength(2);
  });

  it('con un código ajeno no deriva ninguno', () => {
    expect(
      codigosDerivados({
        codigoDeLaCaja: '260423001500103224',
        desdeElPar: 1,
        cuantos: 6,
      }),
    ).toEqual([]);
  });
});
