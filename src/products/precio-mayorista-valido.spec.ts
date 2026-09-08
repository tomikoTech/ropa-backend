import { problemaDelPrecioMayorista } from './precio-mayorista-valido.js';

describe('el precio al por mayor no puede ser el costo', () => {
  it('rechaza el costo escrito en el campo del mayorista', () => {
    // El caso de AMAWAD, exacto.
    expect(
      problemaDelPrecioMayorista({ nuevo: 74, anterior: null, costo: 74 }),
    ).toMatch(/no puede ser menor o igual al costo/);
  });

  it('rechaza también por debajo del costo', () => {
    expect(
      problemaDelPrecioMayorista({ nuevo: 60, anterior: null, costo: 74 }),
    ).not.toBeNull();
  });

  it('acepta un mayorista de verdad: por encima del costo', () => {
    expect(
      problemaDelPrecioMayorista({ nuevo: 79, anterior: null, costo: 74 }),
    ).toBeNull();
  });

  it('no dice nada si no se está tocando el campo', () => {
    expect(problemaDelPrecioMayorista({ costo: 74 })).toBeNull();
  });

  it('un dato viejo malo no tranca las demás ediciones', () => {
    // Editar el nombre reenvía el mismo precio: no es un cambio, no se rechaza.
    expect(
      problemaDelPrecioMayorista({ nuevo: 74, anterior: 74, costo: 74 }),
    ).toBeNull();
  });

  it('borrar el precio siempre se puede', () => {
    expect(
      problemaDelPrecioMayorista({ nuevo: null, anterior: 74, costo: 74 }),
    ).toBeNull();
    expect(
      problemaDelPrecioMayorista({ nuevo: 0, anterior: 74, costo: 74 }),
    ).toBeNull();
  });

  it('sin costo registrado no hay con qué comparar', () => {
    // Cero es «no se registró», no «costó cero».
    expect(problemaDelPrecioMayorista({ nuevo: 74, costo: 0 })).toBeNull();
    expect(problemaDelPrecioMayorista({ nuevo: 74 })).toBeNull();
  });
});
