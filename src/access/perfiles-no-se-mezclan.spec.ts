import {
  MODULES,
  MODULE_KEYS,
  ALWAYS_ALLOWED_ROUTES,
} from './module-registry.js';
import { MODULO_POS_TERCEROS } from './pos-de-terceros.js';
import { MODULO_PANTALLA_SIMPLE } from './pantalla-de-ventas.js';
import { findRoleTemplate } from './role-templates.js';

/**
 * Que un perfil no se convierta en otro sin que nadie se entere.
 *
 * Dos cosas se pueden romper en silencio:
 *
 * 1. **Las claves.** El frontend tiene su copia de `pos-terceros`. Si alguien
 *    la renombra de un lado, el perfil deja de reconocerse y el revendedor
 *    acaba con el punto de venta completo de una tienda. Aca se fija el texto
 *    literal; en el frontend, el mismo. Renombrar uno rompe el otro.
 *
 * 2. **La plantilla.** Agregarle un modulo al revendedor —«total, para que
 *    vea el inventario»— le abriria pantallas y datos que no son suyos, y
 *    ninguna prueba se quejaria.
 */
describe('las claves que unen frontend y servidor', () => {
  it('el modulo del punto de venta de terceros se llama asi', () => {
    expect(MODULO_POS_TERCEROS).toBe('pos-terceros');
  });

  it('el de la pantalla simplificada, asi', () => {
    expect(MODULO_PANTALLA_SIMPLE).toBe('vender');
  });

  it('y los dos existen en el catalogo', () => {
    expect(MODULE_KEYS).toContain(MODULO_POS_TERCEROS);
    expect(MODULE_KEYS).toContain(MODULO_PANTALLA_SIMPLE);
  });
});

describe('lo que se le deja a cualquiera sin permiso', () => {
  /**
   * Las rutas siempre permitidas son las que hacen falta para que la
   * aplicacion se dibuje. Ninguna puede exponer plata.
   *
   * `GET reports/dashboard` estuvo aqui —«las tarjetas del inicio»— y devuelve
   * las ventas del dia y del mes. Con roles restringidos eso es una fuga.
   */
  it('ninguna de ellas devuelve plata de la tienda', () => {
    const rutas = Object.keys(ALWAYS_ALLOWED_ROUTES);
    expect(rutas).not.toContain('GET reports/dashboard');
    for (const r of rutas) {
      expect(
        `${r}: ${/report|balance|caja\/cuadre|incomes|expenses/.test(r)}`,
      ).toBe(`${r}: false`);
    }
  });

  it('y todas son de lectura', () => {
    for (const r of Object.keys(ALWAYS_ALLOWED_ROUTES)) {
      expect(r.startsWith('GET ')).toBe(true);
    }
  });
});

describe('lo que puede el revendedor', () => {
  const perfil = findRoleTemplate('revendedor')!;
  const concedidos = perfil.permissions
    .filter((p) => p.list || p.create || p.edit || p.delete)
    .map((p) => p.module)
    .sort();

  /**
   * La lista completa, escrita a mano. Si manana alguien le agrega uno, esta
   * prueba lo dice y obliga a preguntarse si de verdad lo necesita.
   */
  it('tiene exactamente estos modulos', () => {
    expect(concedidos).toEqual([
      'clients',
      'consignments',
      'expenses',
      'pos-terceros',
    ]);
  });

  it('y en ninguno puede borrar', () => {
    expect(perfil.permissions.filter((p) => p.delete)).toEqual([]);
  });

  /**
   * Lo importante para que esto escale: los modulos que se agreguen manana
   * llegan **apagados** para el. La plantilla se construye desde «nada» y solo
   * enciende lo que nombra, asi que esto se cumple solo — pero si alguien
   * cambia esa base, aqui se ve.
   */
  it('todo lo demas del catalogo le queda apagado', () => {
    const apagados = MODULES.map((m) => m.key).filter(
      (k) => !concedidos.includes(k),
    );
    for (const modulo of apagados) {
      const p = perfil.permissions.find((x) => x.module === modulo);
      expect(`${modulo}:${p?.list || p?.create || p?.edit || p?.delete}`).toBe(
        `${modulo}:false`,
      );
    }
    // Que la comparacion de arriba tenga sentido: si el catalogo creciera y
    // esta lista quedara vacia, la prueba no estaria comprobando nada.
    expect(apagados.length).toBeGreaterThan(20);
  });

  // Es lo que lo distingue de una tienda: no cierra ventas propias.
  it('no puede cerrar una venta del sistema completo', () => {
    const ventas = perfil.permissions.find((p) => p.module === 'sales');
    expect(ventas?.create ?? false).toBe(false);
    expect(ventas?.list ?? false).toBe(false);
  });
});
