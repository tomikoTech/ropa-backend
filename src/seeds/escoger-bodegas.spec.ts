import { escogerBodegas } from './escoger-bodegas.js';

const b = (name: string) => ({ id: name.toLowerCase(), name });

describe('escogerBodegas', () => {
  it('sin bodegas, lo dice', () => {
    expect(() => escogerBodegas([], undefined)).toThrow(/no tiene bodegas/i);
  });

  it('sin pedir nada, la primera', () => {
    expect(escogerBodegas([b('AMAWAD'), b('LOCAL 214')], undefined)).toEqual([
      b('AMAWAD'),
    ]);
  });

  it('por nombre, esa aunque no sea la primera', () => {
    expect(escogerBodegas([b('AMAWAD'), b('LOCAL 214')], 'LOCAL 214')).toEqual([
      b('LOCAL 214'),
    ]);
  });

  it('un nombre que no existe falla y dice cuáles hay', () => {
    expect(() => escogerBodegas([b('AMAWAD')], 'LOCAL 214')).toThrow(
      /No existe la bodega "LOCAL 214".*AMAWAD/s,
    );
  });

  // `null` y no la lista entera: en esta base «sin bodegas asignadas» significa
  // todas (access.service.ts → allowedWarehouses). Insertar las dos de hoy
  // dejaría fuera la que creen mañana.
  it('«todas» es null, no la lista completa', () => {
    expect(escogerBodegas([b('AMAWAD'), b('LOCAL 214')], 'todas')).toBeNull();
  });

  it('«todas» no distingue mayúsculas ni espacios', () => {
    expect(escogerBodegas([b('AMAWAD')], '  TODAS ')).toBeNull();
  });

  it('varias separadas por coma', () => {
    expect(
      escogerBodegas(
        [b('AMAWAD'), b('LOCAL 214'), b('VITRINA')],
        'AMAWAD, VITRINA',
      ),
    ).toEqual([b('AMAWAD'), b('VITRINA')]);
  });

  it('si una de la lista no existe, falla entera y la nombra', () => {
    expect(() => escogerBodegas([b('AMAWAD')], 'AMAWAD, LOCAL 214')).toThrow(
      /LOCAL 214/,
    );
  });

  it('no repite una bodega nombrada dos veces', () => {
    expect(escogerBodegas([b('AMAWAD')], 'AMAWAD, AMAWAD')).toEqual([
      b('AMAWAD'),
    ]);
  });
});
