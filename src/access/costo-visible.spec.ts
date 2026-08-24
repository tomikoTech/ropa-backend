import { puedeVerElCosto } from './costo-visible.js';

describe('quien puede ver el costo', () => {
  it('quien ve Productos, siempre: es la regla de siempre', () => {
    expect(
      puedeVerElCosto('/api/products/search', {
        veProductos: true,
        veTerceros: false,
      }),
    ).toBe(true);
  });

  it('quien no lo ve, no', () => {
    expect(
      puedeVerElCosto('/api/products/search', {
        veProductos: false,
        veTerceros: false,
      }),
    ).toBe(false);
  });

  /**
   * En una venta de tercero el costo **es lo que le debe al dueno**: su
   * propia plata, no el costo de la mercancia de una tienda. Ocultarselo a
   * quien revende le tapa la mitad de su contabilidad —y la pantalla mostraba
   * «$ NaN» donde va lo que debe—.
   */
  it('quien lleva ventas de terceros ve el costo de las suyas', () => {
    expect(
      puedeVerElCosto('/api/consignments', {
        veProductos: false,
        veTerceros: true,
      }),
    ).toBe(true);
  });

  it('y tambien en el resumen y en la libreta', () => {
    for (const ruta of [
      '/api/consignments/summary',
      '/api/consignments/productos',
      '/api/consignments/abc-123',
    ]) {
      expect(
        `${ruta}: ${puedeVerElCosto(ruta, { veProductos: false, veTerceros: true })}`,
      ).toBe(`${ruta}: true`);
    }
  });

  // Pero solo ahi: el costo de la mercancia de la tienda sigue tapado.
  it('no le abre el costo de los productos de la tienda', () => {
    expect(
      puedeVerElCosto('/api/products/search', {
        veProductos: false,
        veTerceros: true,
      }),
    ).toBe(false);
    expect(
      puedeVerElCosto('/api/inventory/stock', {
        veProductos: false,
        veTerceros: true,
      }),
    ).toBe(false);
  });

  // Una ruta que solo empieza parecido no cuenta.
  it('no se cuela una ruta que empieza igual', () => {
    expect(
      puedeVerElCosto('/api/consignments-falsos', {
        veProductos: false,
        veTerceros: true,
      }),
    ).toBe(false);
  });

  it('sin ver terceros, tampoco en sus rutas', () => {
    expect(
      puedeVerElCosto('/api/consignments', {
        veProductos: false,
        veTerceros: false,
      }),
    ).toBe(false);
  });
});
