/**
 * Qué hacer con cada archivo que se sube.
 *
 * Las fotos entraban tal cual llegaban. Las del bucket promedian **660 KB**
 * cuando una foto de producto bien hecha pesa 80–150 KB. No es un problema de
 * costo —el almacenamiento son centavos— sino de quien mira desde el teléfono:
 * una vitrina de treinta productos son veinte megas de datos móviles y varios
 * segundos de espera, en un país donde se compra desde el celular.
 *
 * La decisión está acá, separada de la herramienta que la ejecuta, para poder
 * probarla sin procesar una sola imagen.
 */

/**
 * Ancho al que se reduce una foto de producto.
 *
 * 1400 px cubre la ficha de producto en un portátil y deja margen para el
 * zoom; más allá de eso el peso sube y nadie lo ve. Nunca se **amplía**: una
 * foto pequeña estirada queda borrosa y encima pesando más.
 */
export const ANCHO_MAXIMO = 1400;

/** Calidad webp. A 78 la diferencia no se ve y el archivo baja a la cuarta parte. */
export const CALIDAD = 78;

/** Tipos que se pueden recomprimir sin riesgo de estropear el archivo. */
const FOTOS = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/avif',
]);

export interface PlanDeImagen {
  optimizar: boolean;
  /** A cuánto reducir el ancho. Igual al original si ya es más angosta. */
  anchoMaximo: number;
  calidad: number;
  formato: 'webp';
}

/**
 * `anchoOriginal` puede venir sin valor cuando la imagen no se pudo leer: en
 * ese caso se usa el máximo, que es el lado seguro porque reducir a 1400 nunca
 * agranda nada.
 *
 * El **gif** queda fuera a propósito: suele ser animado y convertirlo a un
 * webp fijo se come la animación. Los videos y cualquier tipo desconocido
 * también: guardar el original es mejor que arriesgarse a corromperlo.
 */
export function planDeImagen(
  mime: string,
  anchoOriginal: number | undefined,
): PlanDeImagen {
  const tipo = (mime || '').toLowerCase();
  const optimizar = FOTOS.has(tipo);
  const ancho =
    anchoOriginal && anchoOriginal > 0
      ? Math.min(anchoOriginal, ANCHO_MAXIMO)
      : ANCHO_MAXIMO;
  return { optimizar, anchoMaximo: ancho, calidad: CALIDAD, formato: 'webp' };
}
