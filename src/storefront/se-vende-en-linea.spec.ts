import { condicionDeVentaEnLinea, porQueNoSePublica, seVendeEnLinea } from './se-vende-en-linea.js';

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
    expect(condicionDeVentaEnLinea('c')).toBe("(c.type IS NULL OR c.type = 'STANDARD')");
  });
});
