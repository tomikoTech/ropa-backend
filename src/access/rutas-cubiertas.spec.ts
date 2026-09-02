import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { moduleForPath, isUncheckedPath } from './module-registry.js';

/**
 * Un controlador nuevo no puede quedar abierto por olvido.
 *
 * `PermissionsGuard` hace `if (!needed) return true`: una ruta que nadie
 * mapeo a un modulo **se permite a todo el mundo**. Con roles restringidos
 * —el revendedor, el vendedor externo— eso es una puerta abierta que nadie
 * ve, y crece sola: cada controlador que se agregue manana la abre otra vez.
 *
 * Habia un comentario que decia que esta prueba existia. No existia: la que
 * habia recorre una lista de rutas escrita a mano, que es la direccion
 * contraria —comprueba que los modulos tengan ruta, no que las rutas tengan
 * modulo—.
 *
 * Esta recorre los controladores **reales** del codigo.
 */
function controladores(dir: string): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) {
      salida.push(...controladores(ruta));
    } else if (entrada.endsWith('.controller.ts')) {
      salida.push(ruta);
    }
  }
  return salida;
}

/**
 * Prefijos sin modulo, a proposito y con nombre.
 *
 * Cada uno es una decision, no un olvido: o no necesita permiso (entrar,
 * salir, la salud del servidor), o su permiso lo pone otra cosa.
 */
const SIN_MODULO_A_PROPOSITO = new Set([
  'auth',
  'health',
  'storefront',
  'payments',
  'uploads',
  'notifications',
  // Suscripción de dispositivos al push: por usuario, no es un módulo con
  // permisos (cualquiera registra su propio celular para recibir avisos).
  'push',
  // Pintoso: chat informativo que no expone plata ni escribe nada; no es un
  // módulo con permisos.
  'assistant',
  'tutoriales',
]);

describe('todo controlador decide su modulo', () => {
  const raiz = join(process.cwd(), 'src');
  const rutas = controladores(raiz);

  it('hay controladores que revisar', () => {
    expect(rutas.length).toBeGreaterThan(10);
  });

  it('ninguno queda sin modulo por olvido', () => {
    const huerfanos: string[] = [];
    for (const archivo of rutas) {
      const fuente = readFileSync(archivo, 'utf-8');
      for (const m of fuente.matchAll(/@Controller\(\s*['"]([^'"]*)['"]/g)) {
        const prefijo = m[1].replace(/^\/+|\/+$/g, '');
        if (!prefijo) continue;
        const raizDelPrefijo = prefijo.split('/')[0];
        if (SIN_MODULO_A_PROPOSITO.has(raizDelPrefijo)) continue;
        const ruta = `/api/${prefijo}`;
        if (isUncheckedPath(ruta)) continue;
        if (!moduleForPath(ruta)) {
          huerfanos.push(`${prefijo} (${archivo.replace(raiz, 'src')})`);
        }
      }
    }
    // Una ruta sin modulo se permite a todo el mundo: o se le pone modulo, o
    // se agrega a SIN_MODULO_A_PROPOSITO diciendo por que.
    expect(huerfanos).toEqual([]);
  });
});
