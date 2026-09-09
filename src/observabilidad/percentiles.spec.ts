import {
  percentil,
  resumirMuestras,
  rutaSinIdentificadores,
} from './percentiles.js';

describe('percentil', () => {
  it('sin muestras no inventa un número', () => {
    expect(percentil([], 95)).toBe(0);
  });

  it('el p95 es lo que sufre uno de cada veinte, no el promedio', () => {
    // Nueve rápidas y una lentísima: el promedio (470) no describe a ninguna.
    const muestras = [80, 80, 80, 80, 80, 80, 80, 80, 80, 4000];
    expect(percentil(muestras, 50)).toBe(80);
    expect(percentil(muestras, 95)).toBe(4000);
  });

  it('no depende del orden en que llegaron', () => {
    expect(percentil([300, 100, 200], 50)).toBe(200);
    expect(percentil([100, 200, 300], 50)).toBe(200);
  });

  it('con una sola muestra, esa es', () => {
    expect(percentil([42], 95)).toBe(42);
    expect(percentil([42], 50)).toBe(42);
  });
});

describe('resumir', () => {
  it('cuenta, ordena y suma', () => {
    expect(resumirMuestras([100, 200, 300, 4000])).toEqual({
      veces: 4,
      p50: 200,
      p95: 4000,
      max: 4000,
      total: 4600,
    });
  });

  it('vacío no rompe', () => {
    expect(resumirMuestras([])).toEqual({
      veces: 0,
      p50: 0,
      p95: 0,
      max: 0,
      total: 0,
    });
  });
});

describe('la ruta sin identificadores', () => {
  it('junta las facturas en una sola fila', () => {
    expect(
      rutaSinIdentificadores(
        '/api/pos/sales/50676346-bed5-4954-bde2-dc6eccaac8ae',
      ),
    ).toBe('/api/pos/sales/:id');
  });

  it('junta los códigos de barras', () => {
    expect(rutaSinIdentificadores('/api/pos/scan/26090800010040019')).toBe(
      '/api/pos/scan/:codigo',
    );
  });

  it('no toca lo que sí distingue pantallas', () => {
    expect(rutaSinIdentificadores('/api/inventory/integridad')).toBe(
      '/api/inventory/integridad',
    );
    expect(rutaSinIdentificadores('/api/reports/balance')).toBe(
      '/api/reports/balance',
    );
  });

  it('un id en medio de la ruta también', () => {
    expect(
      rutaSinIdentificadores(
        '/api/pos/sales/50676346-bed5-4954-bde2-dc6eccaac8ae/receipt',
      ),
    ).toBe('/api/pos/sales/:id/receipt');
  });
});
