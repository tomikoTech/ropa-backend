import {
  filtrosDeLaConsulta,
  hayFiltros,
  listaDelParametro,
} from './filtros-del-mostrador.js';

describe('los filtros del mostrador llegan por la URL', () => {
  it('parte por comas, limpia espacios y quita repetidos', () => {
    expect(listaDelParametro('37,40, 41,,40')).toEqual(['37', '40', '41']);
  });

  it('sin parámetro no hay filtro', () => {
    expect(listaDelParametro(undefined)).toEqual([]);
    expect(listaDelParametro('')).toEqual([]);
    expect(hayFiltros(filtrosDeLaConsulta({}))).toBe(false);
  });

  it('el género va en mayúsculas, como está guardado', () => {
    expect(filtrosDeLaConsulta({ genero: 'mujer' }).generos).toEqual(['MUJER']);
  });

  it('con cualquiera de los tres puesto, hay filtros', () => {
    expect(hayFiltros(filtrosDeLaConsulta({ marca: 'NIKE' }))).toBe(true);
    expect(hayFiltros(filtrosDeLaConsulta({ talla: '37' }))).toBe(true);
  });
});
