import {
  bultosRepetidos,
  numeroDeLaRemision,
  numerosDeLosRenglones,
  paresDeLaRemision,
} from './remision-en-lote.js';

describe('remisión en lote: numeración', () => {
  it('un solo renglón se numera como siempre, sin sufijo', () => {
    expect(numerosDeLosRenglones('TR-00042', 1)).toEqual(['TR-00042']);
  });

  it('varios renglones comparten la remisión y se numeran desde 1', () => {
    expect(numerosDeLosRenglones('TR-00042', 3)).toEqual([
      'TR-00042-1',
      'TR-00042-2',
      'TR-00042-3',
    ]);
  });

  it('de un renglón se vuelve a la remisión', () => {
    expect(numeroDeLaRemision('TR-00042-3')).toBe('TR-00042');
    expect(numeroDeLaRemision('TR-00042')).toBe('TR-00042');
    expect(numeroDeLaRemision(null)).toBeNull();
  });

  it('un número que no es de remisión se deja como está', () => {
    expect(numeroDeLaRemision('RC-2277')).toBe('RC-2277');
  });
});

describe('remisión en lote: qué no puede ir junto', () => {
  it('la misma caja escaneada dos veces se detecta', () => {
    expect(
      bultosRepetidos([
        { variantId: 'v', quantity: 18, stockUnitId: 'caja-1' },
        { variantId: 'v', quantity: 18, stockUnitId: 'caja-1' },
        { variantId: 'v', quantity: 1, stockUnitId: 'par-9' },
      ]),
    ).toEqual(['caja-1']);
  });

  it('dos renglones de la misma talla sin bulto sí pueden ir', () => {
    expect(
      bultosRepetidos([
        { variantId: 'v', quantity: 3 },
        { variantId: 'v', quantity: 2 },
      ]),
    ).toEqual([]);
  });

  it('suma los pares de todos los renglones', () => {
    expect(
      paresDeLaRemision([
        { variantId: 'a', quantity: 18, stockUnitId: 'c' },
        { variantId: 'b', quantity: 2 },
      ]),
    ).toBe(20);
  });
});
