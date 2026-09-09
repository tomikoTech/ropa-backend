import {
  AperturaImposible,
  repartoDeLaApertura,
} from './apertura-parcial.js';

const caja = [
  { sizeId: '40', quantity: 6 },
  { sizeId: '41', quantity: 6 },
  { sizeId: '42', quantity: 12 },
];

describe('abrir la caja entera', () => {
  it('sale todo y no queda nada', () => {
    const r = repartoDeLaApertura(caja);
    expect(r.totalQueSale).toBe(24);
    expect(r.totalQueQueda).toBe(0);
    expect(r.seVacia).toBe(true);
    expect(r.queda).toEqual([]);
  });

  it('ignora las tallas que quedaron en cero', () => {
    const r = repartoDeLaApertura([...caja, { sizeId: '43', quantity: 0 }]);
    expect(r.sale).toHaveLength(3);
  });

  it('una caja sin contenido no se abre', () => {
    expect(() => repartoDeLaApertura([])).toThrow(AperturaImposible);
    expect(() => repartoDeLaApertura([{ sizeId: '40', quantity: 0 }])).toThrow(
      /registra sus tallas/i,
    );
  });
});

describe('sacar unos pares y dejar el resto', () => {
  it('descuenta de la talla pedida y deja las otras quietas', () => {
    const r = repartoDeLaApertura(caja, [{ sizeId: '42', quantity: 3 }]);
    expect(r.totalQueSale).toBe(3);
    expect(r.totalQueQueda).toBe(21);
    expect(r.seVacia).toBe(false);
    expect(r.queda).toEqual([
      { sizeId: '40', quantity: 6 },
      { sizeId: '41', quantity: 6 },
      { sizeId: '42', quantity: 9 },
    ]);
  });

  it('la talla que no se nombra no sale', () => {
    // Y no se completa sola: pedir de menos por olvido tiene que notarse en la
    // caja, no repartirse por su cuenta.
    const r = repartoDeLaApertura(caja, [{ sizeId: '40', quantity: 1 }]);
    expect(r.sale).toEqual([{ sizeId: '40', quantity: 1 }]);
    expect(r.totalQueQueda).toBe(23);
  });

  it('sacar justo todo lo que hay vacía la caja', () => {
    const r = repartoDeLaApertura(caja, [
      { sizeId: '40', quantity: 6 },
      { sizeId: '41', quantity: 6 },
      { sizeId: '42', quantity: 12 },
    ]);
    expect(r.seVacia).toBe(true);
    expect(r.queda).toEqual([]);
  });

  it('no deja sacar más de lo que hay', () => {
    expect(() => repartoDeLaApertura(caja, [{ sizeId: '40', quantity: 7 }])).toThrow(
      /tiene 6 pares/i,
    );
  });

  it('no deja sacar una talla que no está adentro', () => {
    expect(() =>
      repartoDeLaApertura(caja, [{ sizeId: '45', quantity: 1 }]),
    ).toThrow(/no está dentro de la caja/i);
  });

  it('no acepta pedir nada', () => {
    expect(() => repartoDeLaApertura(caja, [])).toThrow(/elige cuántos pares/i);
    expect(() =>
      repartoDeLaApertura(caja, [{ sizeId: '40', quantity: 0 }]),
    ).toThrow(/elige cuántos pares/i);
  });

  it('no acepta media unidad ni negativos', () => {
    expect(() =>
      repartoDeLaApertura(caja, [{ sizeId: '40', quantity: 1.5 }]),
    ).toThrow(/enteros/i);
    expect(() =>
      repartoDeLaApertura(caja, [{ sizeId: '40', quantity: -2 }]),
    ).toThrow(/enteros/i);
  });

  it('no acepta la misma talla dos veces', () => {
    expect(() =>
      repartoDeLaApertura(caja, [
        { sizeId: '40', quantity: 1 },
        { sizeId: '40', quantity: 2 },
      ]),
    ).toThrow(/solo puede aparecer una vez/i);
  });
});
