import { soloLoSuyo } from './solo-lo-suyo.js';
import { MODULO_PANTALLA_SIMPLE } from './pantalla-de-ventas.js';
import { MODULO_POS_TERCEROS } from './pos-de-terceros.js';

const puede =
  (m: Record<string, string[]>) =>
  (modulo: string, accion = 'list') =>
    (m[modulo] ?? []).includes(accion);

const revendedor = puede({
  [MODULO_POS_TERCEROS]: ['list'],
  consignments: ['list', 'create'],
});
const vendedorConBodegas = puede({
  [MODULO_PANTALLA_SIMPLE]: ['list'],
  sales: ['list'],
});
const cajero = puede({ sales: ['list', 'create'], consignments: ['list'] });

describe('de quien es la plata que cada uno ve', () => {
  // Dos personas naturales en la misma tienda no pueden verse la plata: cada
  // una lleva su propia contabilidad, y es lo unico que le importa.
  it('quien revende, solo la suya', () => {
    expect(soloLoSuyo(revendedor, 'u1')).toBe('u1');
  });

  it('quien usa la pantalla simplificada, solo la suya', () => {
    expect(soloLoSuyo(vendedorConBodegas, 'u1')).toBe('u1');
  });

  // `null` es «sin filtro», que es lo que necesita quien administra.
  it('quien usa el sistema completo, la de la tienda', () => {
    expect(soloLoSuyo(cajero, 'u1')).toBeNull();
  });

  it('el administrador, la de la tienda: es su trabajo', () => {
    expect(soloLoSuyo(() => true, 'u1', { sinMatriz: true })).toBeNull();
  });

  // Sin permisos no se abre la tienda entera.
  it('sin permisos cargados, solo la suya', () => {
    expect(soloLoSuyo(null, 'u1')).toBe('u1');
  });
});
