import { bultosRepetidos, porQueNoSePuedeGuardar } from './bultos-repetidos.js';

describe('un bulto no puede ir dos veces en la misma factura', () => {
  it('una factura sana no repite nada', () => {
    expect(
      bultosRepetidos([{ stockUnitIds: ['a'] }, { stockUnitIds: ['b'] }]),
    ).toEqual([]);
  });

  it('caza el mismo código en dos renglones', () => {
    expect(
      bultosRepetidos([{ stockUnitIds: ['a'] }, { stockUnitIds: ['a'] }]),
    ).toEqual([{ id: 'a', veces: 2 }]);
  });

  it('caza la caja aplanada en 24 renglones', () => {
    // Lo que rompió la factura: 24 pares arrastrando el código de su caja.
    const renglones = Array.from({ length: 24 }, () => ({
      stockUnitIds: ['la-caja'],
    }));
    expect(bultosRepetidos(renglones)).toEqual([{ id: 'la-caja', veces: 24 }]);
  });

  it('un renglón con varios bultos distintos está bien', () => {
    expect(bultosRepetidos([{ stockUnitIds: ['a', 'b'] }])).toEqual([]);
  });

  it('pero repetido dentro del mismo renglón, no', () => {
    expect(bultosRepetidos([{ stockUnitIds: ['a', 'a'] }])).toEqual([
      { id: 'a', veces: 2 },
    ]);
  });

  it('los renglones sin bultos no estorban', () => {
    expect(bultosRepetidos([{}, { stockUnitIds: [] }, { stockUnitIds: ['a'] }])).toEqual(
      [],
    );
  });
});

describe('el mensaje', () => {
  it('dice el código y cuántas veces', () => {
    const m = porQueNoSePuedeGuardar([{ id: 'caja-1', veces: 24 }]);
    expect(m).toContain('caja-1 (24 veces)');
    expect(m).toContain('no se puede vender dos veces');
  });

  it('con muchos, nombra tres y cuenta el resto', () => {
    const m = porQueNoSePuedeGuardar(
      ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, veces: 2 })),
    );
    expect(m).toContain('y 2 más');
  });
});
