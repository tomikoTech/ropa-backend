import {
  MODULO_PANTALLA_SIMPLE,
  usaPantallaSimple,
  necesitaAutorizacion,
  soloSusVentas,
} from './pantalla-de-ventas.js';

const puede =
  (m: Record<string, string[]>) =>
  (modulo: string, accion = 'list') =>
    (m[modulo] ?? []).includes(accion);

const pideAutorizacion = puede({
  [MODULO_PANTALLA_SIMPLE]: ['list'],
  quotations: ['list', 'create'],
  sales: ['list'],
});
const cobraDirecto = puede({
  [MODULO_PANTALLA_SIMPLE]: ['list'],
  sales: ['list', 'create'],
});
const cajero = puede({
  sales: ['list', 'create'],
  quotations: ['list', 'create'],
});

describe('quién usa la pantalla simplificada', () => {
  // Es un permiso propio y no algo deducido de otros: así el dueño lo
  // enciende o lo apaga desde la matriz, sin que nadie tenga que adivinar
  // qué combinación produce qué pantalla.
  it('quien tiene el módulo, sí', () => {
    expect(usaPantallaSimple(pideAutorizacion)).toBe(true);
    expect(usaPantallaSimple(cobraDirecto)).toBe(true);
  });

  it('un cajero corriente, no: ese usa el sistema completo', () => {
    expect(usaPantallaSimple(cajero)).toBe(false);
  });

  it('sin permisos cargados, no', () => {
    expect(usaPantallaSimple(null)).toBe(false);
  });

  // El pozo: `userCan` devuelve **true para todo** a quien no tiene matriz —un
  // administrador—. Sin esta regla el administrador quedaba clasificado como
  // pantalla simplificada y solo veía sus propias ventas: la tienda entera
  // desaparecía de su historial.
  it('quien no tiene matriz —un administrador— nunca, aunque diga que sí a todo', () => {
    expect(usaPantallaSimple(() => true, { sinMatriz: true })).toBe(false);
  });

  it('pero con matriz, un «sí» sigue valiendo', () => {
    expect(usaPantallaSimple(() => true, { sinMatriz: false })).toBe(true);
  });
});

describe('quién tiene que pedir autorización', () => {
  // La diferencia entre los dos perfiles es **una sola**: poder cerrar la
  // venta. Todo lo demás lo ven igual.
  it('sin poder crear ventas, la deja esperando', () => {
    expect(necesitaAutorizacion(pideAutorizacion)).toBe(true);
  });

  it('con poder crear ventas, cobra ahí mismo', () => {
    expect(necesitaAutorizacion(cobraDirecto)).toBe(false);
  });

  it('sin permisos cargados no se asume que puede cobrar', () => {
    expect(necesitaAutorizacion(null)).toBe(true);
  });
});

describe('de quién es la plata que ve', () => {
  it('en la pantalla simplificada, solo la suya', () => {
    expect(soloSusVentas(cobraDirecto, 'u1')).toBe('u1');
    expect(soloSusVentas(pideAutorizacion, 'u1')).toBe('u1');
  });

  // `null` es «sin filtro», que es lo que necesita quien administra.
  it('quien usa el sistema completo ve la tienda entera', () => {
    expect(soloSusVentas(cajero, 'u1')).toBeNull();
  });

  it('el administrador ve la tienda entera, que es su trabajo', () => {
    expect(soloSusVentas(() => true, 'u1', { sinMatriz: true })).toBeNull();
  });

  it('sin permisos cargados no se abre la tienda entera', () => {
    expect(soloSusVentas(null, 'u1')).toBe('u1');
  });
});
