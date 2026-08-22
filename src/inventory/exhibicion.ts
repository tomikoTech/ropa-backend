/**
 * La exhibición: el par que está en la vitrina.
 *
 * Nace de la única falencia que un dueño de tres locales le encontró a la
 * aplicación que usa: allá la exhibición vive en **un inventario aparte**, y
 * por eso «si yo voy a hacer una venta múltiple de cuatro pares y una es la
 * exhibición, primero tengo que reportar los tres y después tengo que reportar
 * la exhibición». Sus palabras: «el man nunca ha podido articular eso».
 *
 * Acá la vitrina es **una bodega más**. La cascada de la venta ya descuenta de
 * varias bodegas en un solo ticket, así que exhibición y bodega salen en la
 * misma factura sin que nadie reporte nada aparte. Quedan dos decisiones, y
 * las dos viven en este archivo para poder probarlas sin montar una venta:
 *
 * 1. **En qué orden** se descuenta: la muestra se toca de última.
 * 2. **Cuándo falta por exhibir**: qué avisar cuando la muestra se fue.
 */

/**
 * Una fila de existencia: la bodega y cuánto hay.
 *
 * Genérico a propósito, para que la fila de `stock` entre tal cual y no haya
 * que traducirla a otra forma antes de ordenarla —esa traducción sería código
 * sin prueba justo en el camino que decide de dónde sale la mercancía—.
 */
export interface FilaDeExistencia {
  warehouseId: string;
  /** `decimal` de Postgres llega como texto; se compara como número. */
  quantity: number | string;
}

/**
 * En qué orden se le saca a cada bodega.
 *
 * Tres reglas, en este orden:
 *
 * 1. **La vitrina, de última.** Vender la muestra teniendo pares en la bodega
 *    deja el local sin qué mostrar y obliga a un traslado que nadie pidió. Que
 *    la venta se cobre en la vitrina no la asciende: sigue siendo la muestra.
 * 2. **Primero donde se cobra.** El par que el cliente tiene en la mano sale
 *    del local donde está parado.
 * 3. **Luego la que más tenga**, y a igualdad de todo, por identificador:
 *    dos corridas con los mismos datos tienen que elegir las mismas bodegas o
 *    un descuadre deja de ser reproducible.
 *
 * No modifica la lista que recibe: el llamador la sigue usando para leer los
 * saldos originales.
 */
export function ordenarParaDescuento<T extends FilaDeExistencia>(
  bodegas: T[],
  bodegaDeLaVenta: string,
  esVitrina: (warehouseId: string) => boolean,
): T[] {
  return [...bodegas].sort((a, b) => {
    const aEsVitrina = esVitrina(a.warehouseId);
    const bEsVitrina = esVitrina(b.warehouseId);
    if (aEsVitrina !== bEsVitrina) return aEsVitrina ? 1 : -1;
    const aEsDeLaVenta = a.warehouseId === bodegaDeLaVenta;
    const bEsDeLaVenta = b.warehouseId === bodegaDeLaVenta;
    if (aEsDeLaVenta !== bEsDeLaVenta) return aEsDeLaVenta ? -1 : 1;
    const cantidadA = Number(a.quantity);
    const cantidadB = Number(b.quantity);
    if (cantidadA !== cantidadB) return cantidadB - cantidadA;
    return a.warehouseId.localeCompare(b.warehouseId);
  });
}

export interface ConfiguracionExhibicion {
  /** Apagada por defecto: no todas las tiendas exhiben. */
  encendida: boolean;
  /** Cuántos pares debe haber en vitrina de cada referencia. */
  objetivo: number;
}

export interface EstadoDeLaVitrina {
  /** Lo que hay hoy en la vitrina. */
  enVitrina: number;
  /** Lo que el local que la surte puede subir a la vitrina. */
  disponibleEnElLocal: number;
  /**
   * El objetivo propio de esta referencia, si la tienda se lo puso.
   *
   * `null` = usar el general. `0` **no** es lo mismo: es la decisión de no
   * exhibir esa referencia —las cajas de cartón y los accesorios no van en
   * vitrina—.
   */
  objetivoPropio: number | null;
}

/**
 * Cuánto falta por subir a la vitrina.
 *
 * «Venden un zapato que está en exhibición, que es la muestra. Si lo venden o
 * lo prestan, ahí automáticamente ya sale la alerta de que falta por exhibir.»
 *
 * Nunca pide lo que el local no tiene: un pendiente que nadie puede cumplir el
 * vendedor lo lee como un error suyo y termina ignorando la lista entera. Es
 * la misma lección que dejó la reposición automática.
 *
 * **Cuatro de las guardas de abajo son redundantes a propósito** y no hay
 * prueba que las mate: el objetivo en cero, el objetivo negativo, el `falta
 * <= 0` y el disponible negativo desembocan todos en el `cantidad > 0` final,
 * que devuelve `null` igual. Están porque dicen *por qué* —cero es la decisión
 * de no exhibir, no un valor sin poner— y porque dejan el razonamiento en la
 * línea donde ocurre en vez de tres líneas abajo. Quien corra mutaciones acá
 * las va a ver sobrevivir: no son huecos de la prueba. La que **sí** importa y
 * sí se caza es `Math.max(0, estado.enVitrina)`.
 */
export function faltaPorExhibir(
  config: ConfiguracionExhibicion,
  estado: EstadoDeLaVitrina,
): { cantidad: number } | null {
  if (!config.encendida) return null;

  // Un objetivo negativo es configuración mal puesta, no una deuda.
  const objetivo = Math.max(0, estado.objetivoPropio ?? config.objetivo);
  if (objetivo === 0) return null;

  // Un saldo negativo es existencia mal cuadrada de antes: exhibir de más por
  // un error viejo desabastece el local.
  const enVitrina = Math.max(0, estado.enVitrina);
  const falta = objetivo - enVitrina;
  if (falta <= 0) return null;

  const cantidad = Math.min(falta, Math.max(0, estado.disponibleEnElLocal));
  return cantidad > 0 ? { cantidad } : null;
}
