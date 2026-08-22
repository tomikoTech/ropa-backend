import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * El inventario se mueve por un solo sitio.
 *
 * Una auditoría encontró **21 caminos** que escribían `stock.quantity` sin
 * tocar los códigos de los bultos —o al revés—. El desvío creció en silencio
 * hasta 866 unidades contra 512 etiquetadas en una tienda, y se descubrió
 * cuando alguien fue a buscar un par que el sistema decía tener.
 *
 * Arreglar los 21 los deja arreglados hoy; el siguiente que se escriba vuelve
 * a romperlo. Esta prueba es lo que hace que se quede arreglado: si alguien
 * escribe `stock.quantity` fuera del `StockLedger`, falla aquí y no en
 * producción tres semanas después.
 *
 * La lista de excepciones es deliberadamente corta y cada una lleva su porqué.
 * Si tienes que añadir una, piensa dos veces: casi siempre significa que esa
 * operación debería estar pasando por el ledger.
 */

const RAIZ = join(process.cwd(), 'src');

/**
 * Lo que todavía no pasa por el ledger, con su razón.
 *
 * Se van quitando a medida que cada camino se migra. Un archivo que sale de
 * esta lista no puede volver a entrar sin que alguien lo justifique.
 */
const PENDIENTES_DE_MIGRAR: Record<string, string> = {
  'inventory/inventory.service.ts':
    'solo queda `getOrCreateStockTx`: ajuste, traslados y préstamos ya pasan por el ledger',
  'inventory/stock-units.service.ts':
    'ya mantiene las dos caras; se moverá al ledger para tener un solo camino',
  'pos/pos.service.ts': 'venta, anulación y edición de factura',
  'purchases/purchases.service.ts': 'recepción de compra',
  'returns/returns.service.ts': 'devoluciones',
  'street/street.service.ts': 'remisiones de calle',
  'internal-requests/internal-requests.service.ts': 'solicitudes internas',
  'storefront/store-settings.service.ts': 'pedidos de la tienda online',
  'production/production.service.ts':
    'perfumería: no lleva bultos, pero debería pasar igual por el ledger',
  'products/services/recipe.service.ts': 'consumo de esencias por receta',
  'products/products.service.ts': 'crea filas de stock en cero al alta',
};

/** Los seeds e importadores cargan datos, no operan la tienda. */
const EXENTOS = ['seeds/', 'migrations/', 'ledger/'];

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) return archivos(ruta);
    return nombre.endsWith('.ts') && !nombre.endsWith('.spec.ts') ? [ruta] : [];
  });
}

describe('el inventario se mueve por un solo sitio', () => {
  const escrituras = new Map<string, number>();

  beforeAll(() => {
    // Escribir el agregado tiene dos señales, y hacen falta **las dos** para no
    // confundirlo con cualquier objeto que tenga un campo `quantity`: una
    // consignación y la propia entidad de movimientos lo tienen, y no mueven
    // inventario.
    const importaStock = /from '[^']*\/stock\.entity\.js'/;
    // **Escrituras**, no lecturas. `getRepository(Stock)` a secas es legítimo:
    // varios servicios necesitan leer la existencia para decidir. Marcar la
    // lectura llenaba la lista de falsos positivos, y una prueba que grita por
    // cosas correctas deja de leerse.
    const escribe =
      /\.quantity\s*(=|\+=|-=)|stockRepo(sitory)?\.save\(|getRepository\(Stock\)\s*\.\s*save\(/;

    for (const ruta of archivos(RAIZ)) {
      const relativa = ruta.slice(RAIZ.length + 1);
      if (EXENTOS.some((e) => relativa.includes(e))) continue;
      const texto = readFileSync(ruta, 'utf8');
      if (!importaStock.test(texto)) continue;
      const golpes = texto.split('\n').filter((l) => {
        const limpia = l.trim();
        if (limpia.startsWith('//') || limpia.startsWith('*')) return false;
        return escribe.test(limpia);
      }).length;
      if (golpes > 0) escrituras.set(relativa, golpes);
    }
  });

  it('ningún archivo nuevo escribe el stock por su cuenta', () => {
    const intrusos = [...escrituras.keys()].filter(
      (ruta) => !(ruta in PENDIENTES_DE_MIGRAR),
    );
    // El mensaje va dentro del valor esperado: Jest no admite un segundo
    // argumento en `expect`, y un `[]` vacío no le dice a nadie qué hacer.
    const explicacion = intrusos.length
      ? `Estos archivos mueven inventario sin pasar por StockLedger:\n${intrusos.join('\n')}\n` +
        'Usa ledger.mover(...) o ledger.trasladar(...): mantienen el agregado y ' +
        'los códigos de los bultos cuadrados en la misma transacción.'
      : '';
    expect(explicacion).toBe('');
  });

  it('la lista de pendientes solo se puede achicar', () => {
    // Si un archivo ya no escribe stock, hay que sacarlo de la lista. Así la
    // lista mide el avance real del refactor en vez de quedarse de adorno.
    const yaMigrados = Object.keys(PENDIENTES_DE_MIGRAR).filter(
      (ruta) => !escrituras.has(ruta),
    );
    const explicacion = yaMigrados.length
      ? `Estos ya no escriben stock: sácalos de PENDIENTES_DE_MIGRAR.\n${yaMigrados.join('\n')}`
      : '';
    expect(explicacion).toBe('');
  });
});
