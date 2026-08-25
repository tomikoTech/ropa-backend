import {
  bodegaDelFrasco,
  categoriaDelFrasco,
} from './donde-va-el-frasco.js';

describe('categoriaDelFrasco', () => {
  it('la encuentra por su tipo, se llame como se llame', () => {
    // Es el caso que se rompía: la tienda le puso «Envases» y la creación
    // automática dejó de funcionar sin decir nada.
    const cat = categoriaDelFrasco([
      { id: 'l', name: 'Lociones', type: 'STANDARD' },
      { id: 'e', name: 'Envases', type: 'FRASCO' },
    ]);
    expect(cat?.id).toBe('e');
  });

  it('el tipo gana sobre el nombre', () => {
    // Una categoría llamada «Frascos» pero marcada como producto normal no es
    // la de frascos: el tipo es el dato, el nombre es la etiqueta.
    const cat = categoriaDelFrasco([
      { id: 'falsa', name: 'Frascos', type: 'STANDARD' },
      { id: 'buena', name: 'Envases', type: 'FRASCO' },
    ]);
    expect(cat?.id).toBe('buena');
  });

  it('cae al nombre cuando ninguna tiene tipo', () => {
    // Las tiendas viejas crearon su categoría antes de que el tipo existiera.
    const cat = categoriaDelFrasco([
      { id: 'l', name: 'Lociones' },
      { id: 'f', name: 'Frascos' },
    ]);
    expect(cat?.id).toBe('f');
  });

  it('el nombre no distingue mayúsculas ni tildes', () => {
    expect(categoriaDelFrasco([{ id: 'f', name: 'FRASCOS' }])?.id).toBe('f');
    expect(categoriaDelFrasco([{ id: 'f', name: ' Frascos ' }])?.id).toBe('f');
  });

  it('sin ninguna candidata devuelve null', () => {
    expect(
      categoriaDelFrasco([{ id: 'l', name: 'Lociones', type: 'STANDARD' }]),
    ).toBeNull();
    expect(categoriaDelFrasco([])).toBeNull();
  });

  it('con varias del tipo correcto se queda con la primera', () => {
    const cat = categoriaDelFrasco([
      { id: 'a', name: 'Envases', type: 'FRASCO' },
      { id: 'b', name: 'Frascos', type: 'FRASCO' },
    ]);
    expect(cat?.id).toBe('a');
  });
});

describe('bodegaDelFrasco', () => {
  it('la encuentra por nombre', () => {
    const b = bodegaDelFrasco([
      { id: 'p', name: 'Principal' },
      { id: 'f', name: 'FRASCOS' },
    ]);
    expect(b?.id).toBe('f');
  });

  it('no usa una bodega desactivada', () => {
    // Meter existencias en una bodega que la tienda apagó es esconderlas.
    const b = bodegaDelFrasco([
      { id: 'vieja', name: 'Frascos', isActive: false },
      { id: 'nueva', name: 'Frascos', isActive: true },
    ]);
    expect(b?.id).toBe('nueva');
  });

  it('sin bodega de frascos devuelve null, y no pasa nada', () => {
    // El frasco se crea igual; la fila en cero es una comodidad, no un
    // requisito.
    expect(bodegaDelFrasco([{ id: 'p', name: 'Principal' }])).toBeNull();
    expect(bodegaDelFrasco([])).toBeNull();
  });
});
