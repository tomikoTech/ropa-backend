import {
  condicionDeVentaEnLinea,
  porQueNoSePublica,
  seVendeEnLinea,
  tienePrecio,
} from './se-vende-en-linea.js';

describe('qué se vende en la tienda online', () => {
  it('los terminados sí, con o sin categoría', () => {
    expect(seVendeEnLinea('STANDARD')).toBe(true);
    expect(seVendeEnLinea(null)).toBe(true);
    expect(seVendeEnLinea(undefined)).toBe(true);
  });

  it('frascos y esencias no: son insumos', () => {
    expect(seVendeEnLinea('FRASCO')).toBe(false);
    expect(seVendeEnLinea('ESSENCE')).toBe(false);
    expect(porQueNoSePublica('FRASCO')).toMatch(/frascos/i);
    expect(porQueNoSePublica('ESSENCE')).toMatch(/esencias/i);
    expect(porQueNoSePublica('STANDARD')).toBeNull();
  });

  it('la condición SQL acepta nulos (productos sin categoría)', () => {
    expect(condicionDeVentaEnLinea('c')).toBe(
      "(c.type IS NULL OR c.type = 'STANDARD')",
    );
  });

  it('sin precio no se vende ni se publica (el Estuche Yara a $0)', () => {
    expect(seVendeEnLinea('STANDARD', 0)).toBe(false);
    expect(seVendeEnLinea(null, '0.00')).toBe(false);
    expect(seVendeEnLinea('STANDARD', 40000)).toBe(true);
    expect(porQueNoSePublica('STANDARD', 0)).toBe(
      'Ponle precio antes de publicarlo.',
    );
    expect(porQueNoSePublica('STANDARD', 40000)).toBeNull();
    // Un frasco a $0 sigue siendo insumo primero.
    expect(porQueNoSePublica('FRASCO', 0)).toMatch(/frascos/i);
  });

  it('una variante con precio propio salva al producto a $0', () => {
    expect(tienePrecio(0, [null, '35000'])).toBe(true);
    expect(seVendeEnLinea('STANDARD', 0, ['35000'])).toBe(true);
    expect(porQueNoSePublica('STANDARD', 0, [0, null])).toBe(
      'Ponle precio antes de publicarlo.',
    );
  });
});
