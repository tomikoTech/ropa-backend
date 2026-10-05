import { diaEnPalabras, rangoEfectivo } from './desde-cuando';

/**
 * Por qué existe: Distri Amber cargó 643 abonos históricos y el efectivo
 * decía 483 millones. La tienda dice «cuento desde el 1 de octubre» y nada
 * anterior suma.
 */
describe('desde cuándo cuenta la tesorería', () => {
  it('sin fecha configurada, cuenta desde siempre y sin aviso', () => {
    const r = rangoEfectivo(null);
    expect(r.desde).toBeNull();
    expect(r.hasta).toBeNull();
    expect(r.aviso).toBeNull();
    expect(r.tesoreriaDesde).toBeNull();
  });

  it('con fecha, el piso es la medianoche colombiana de ese día', () => {
    const r = rangoEfectivo('2026-10-01');
    // Colombia es UTC-5 todo el año: el 1 de octubre empezó a las 05:00 UTC.
    expect(r.desde?.toISOString()).toBe('2026-10-01T05:00:00.000Z');
    expect(r.hasta).toBeNull();
    expect(r.aviso).toBe('Contando desde el 1 de octubre de 2026');
  });

  it('un rango pedido que empieza antes se recorta al piso', () => {
    const r = rangoEfectivo('2026-10-01', {
      from: '2026-09-01',
      to: '2026-10-31',
    });
    expect(r.desde?.toISOString()).toBe('2026-10-01T05:00:00.000Z');
    // El 31 de octubre completo, hasta un milisegundo antes del 1 de noviembre.
    expect(r.hasta?.toISOString()).toBe('2026-11-01T04:59:59.999Z');
  });

  it('un rango pedido que empieza después se respeta', () => {
    const r = rangoEfectivo('2026-10-01', { from: '2026-10-15' });
    expect(r.desde?.toISOString()).toBe('2026-10-15T05:00:00.000Z');
  });

  it('acepta instantes completos, como los manda el navegador', () => {
    const r = rangoEfectivo(null, {
      from: '2026-10-05T00:00:00.000Z',
      to: '2026-10-05T23:59:59.999Z',
    });
    expect(r.desde?.toISOString()).toBe('2026-10-05T00:00:00.000Z');
    expect(r.hasta?.toISOString()).toBe('2026-10-05T23:59:59.999Z');
  });

  it('una fecha mal guardada no revienta: se ignora', () => {
    expect(rangoEfectivo('octubre').desde).toBeNull();
  });

  it('el aviso se lee como se dice', () => {
    expect(diaEnPalabras('2026-01-15')).toBe('15 de enero de 2026');
  });
});
