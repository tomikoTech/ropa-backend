import { armarPaginado, resolverPagina } from './paginacion.js';

/**
 * El cálculo de página, compartido por todos los listados.
 *
 * Se prueba solo, sin base de datos, porque el error que evita no es de SQL: es
 * pedir de más (un `?limit=999999` que se trae la tabla entera), contar mal las
 * páginas, o dejar que el total de una tarjeta sea el de la página visible en
 * vez del filtro completo.
 */
describe('resolverPagina', () => {
  const cfg = { limitDefault: 30, limitMax: 200 };

  it('sin parámetros usa la página 1 y el límite por defecto', () => {
    expect(resolverPagina({}, cfg)).toEqual({ page: 1, limit: 30, offset: 0 });
  });

  it('el offset es (página - 1) × límite', () => {
    expect(resolverPagina({ page: 3, limit: 20 }, cfg)).toEqual({
      page: 3,
      limit: 20,
      offset: 40,
    });
  });

  it('un límite mayor que el tope se recorta al tope', () => {
    // Ningún parámetro de la URL decide cuánta base se lee.
    expect(resolverPagina({ limit: 999999 }, cfg).limit).toBe(200);
  });

  it('basura en la página o el límite cae a los valores por defecto', () => {
    // `?page=abc&limit=-5` es «no me lo mandaron», no un error.
    expect(resolverPagina({ page: 'abc', limit: '-5' }, cfg)).toEqual({
      page: 1,
      limit: 30,
      offset: 0,
    });
  });

  it('acepta números que llegan como texto desde la URL', () => {
    expect(resolverPagina({ page: '2', limit: '50' }, cfg)).toEqual({
      page: 2,
      limit: 50,
      offset: 50,
    });
  });
});

describe('armarPaginado', () => {
  const pagina = { page: 2, limit: 20, offset: 20 };

  it('calcula el número de páginas sobre el total, no sobre la página', () => {
    const r = armarPaginado(['a', 'b'], 45, pagina);
    expect(r.total).toBe(45);
    expect(r.totalPages).toBe(3); // ceil(45 / 20)
    expect(r.page).toBe(2);
    expect(r.limit).toBe(20);
    expect(r.data).toEqual(['a', 'b']);
  });

  it('sin resultados son cero páginas, no una vacía', () => {
    // «Página 1 de 1» sobre una lista vacía se lee como un error de carga.
    expect(armarPaginado([], 0, pagina).totalPages).toBe(0);
  });

  it('un total que cabe justo en una página no inventa una segunda', () => {
    expect(armarPaginado([], 20, { page: 1, limit: 20, offset: 0 }).totalPages).toBe(1);
  });

  it('adjunta el resumen tal cual, para los agregados de TODO el filtro', () => {
    // El resumen se calcula aparte, sobre el conjunto completo, y viaja al lado
    // de la página para que las tarjetas no cuenten solo lo visible.
    const resumen = { unidades: 1355, referencias: 18, bajoMinimo: 3 };
    expect(armarPaginado(['a'], 18, pagina, resumen).resumen).toEqual(resumen);
  });

  it('sin resumen no mete la llave, para no confundir «no hay» con «cero»', () => {
    expect('resumen' in armarPaginado(['a'], 1, pagina)).toBe(false);
  });
});
