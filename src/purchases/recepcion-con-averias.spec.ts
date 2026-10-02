import { resolverRecepcion } from './recepcion-con-averias.js';

describe('resolverRecepcion', () => {
  it('llegaron 100, uno malo: 99 disponibles y la compra queda completa', () => {
    const r = resolverRecepcion({
      ordenadas: 100,
      yaRecibidas: 0,
      recibidas: 100,
      averiadas: 1,
    });
    expect(r).toEqual({
      recibidas: 100,
      averiadas: 1,
      disponibles: 99,
      pendientes: 0,
    });
  });

  it('recepción por partes: lo que falta se calcula sobre lo ya recibido', () => {
    const r = resolverRecepcion({
      ordenadas: 100,
      yaRecibidas: 60,
      recibidas: 30,
    });
    expect(r.pendientes).toBe(10);
    expect(r.averiadas).toBe(0);
    expect(r.error).toBeUndefined();
  });

  it('no pueden llegar más de las pedidas', () => {
    expect(
      resolverRecepcion({ ordenadas: 100, yaRecibidas: 60, recibidas: 50 })
        .error,
    ).toContain('no pueden llegar más');
  });

  it('no pueden venir más averiadas que recibidas, ni negativos', () => {
    expect(
      resolverRecepcion({
        ordenadas: 10,
        yaRecibidas: 0,
        recibidas: 5,
        averiadas: 6,
      }).error,
    ).toContain('averiadas');
    expect(
      resolverRecepcion({ ordenadas: 10, yaRecibidas: 0, recibidas: -1 }).error,
    ).toContain('negativas');
  });
});
