import {
  describeBoxContents,
  describeBoxSizes,
  sortSizes,
  totalPairs,
} from './box-description.js';

/**
 * Una caja surtida 36-39 quedaba registrada en la factura como «talla 36»,
 * porque el inventario agregado necesita una variante y se copiaba la suya.
 */
describe('cómo se nombra el contenido de una caja', () => {
  const curva = [
    { size: '38', quantity: 6 },
    { size: '36', quantity: 6 },
    { size: '39', quantity: 6 },
    { size: '37', quantity: 6 },
  ];

  it('ordena las tallas como las lee una persona', () => {
    expect(sortSizes([{ size: '36', quantity: 1 }, { size: '9', quantity: 1 }])).toEqual([
      { size: '9', quantity: 1 },
      { size: '36', quantity: 1 },
    ]);
  });

  it('una caja surtida dice su rango, no una talla suelta', () => {
    expect(describeBoxSizes(curva)).toBe('Surtido 36-39');
  });

  it('con una sola talla sí se puede nombrar la talla', () => {
    expect(describeBoxSizes([{ size: '40', quantity: 12 }])).toBe('Talla 40');
  });

  it('sin detalle no se inventa una talla', () => {
    expect(describeBoxSizes([])).toBe('Tallas mixtas');
    // Una talla en cero no está en la caja.
    expect(describeBoxSizes([{ size: '36', quantity: 0 }])).toBe('Tallas mixtas');
  });

  it('el desglose dice cuántos pares de cada talla', () => {
    expect(describeBoxContents(curva)).toBe('36×6 · 37×6 · 38×6 · 39×6');
    expect(describeBoxContents([])).toBe('');
  });

  it('cuenta los pares del surtido', () => {
    expect(totalPairs(curva)).toBe(24);
    expect(totalPairs([])).toBe(0);
  });
});
