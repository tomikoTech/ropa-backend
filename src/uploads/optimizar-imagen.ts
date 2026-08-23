import { Logger } from '@nestjs/common';
import sharp from 'sharp';
import { planDeImagen } from './plan-de-imagen.js';

const log = new Logger('OptimizarImagen');

export interface ImagenLista {
  buffer: Buffer;
  mime: string;
  ext: string;
}

/**
 * Deja la imagen en un tamaño razonable antes de guardarla.
 *
 * Qué se toca y qué no lo decide `planDeImagen`, que se prueba sin procesar una
 * sola imagen. Acá solo se ejecuta.
 *
 * Dos salvaguardas, las dos por el mismo motivo —**perder la foto del cliente
 * es peor que guardarla pesada**—:
 *
 * 1. Si algo falla, se sube el original. Un formato raro, un archivo corrupto o
 *    un `sharp` que no arrancó no pueden tumbar el alta de un producto.
 * 2. Si el resultado no pesa menos, se sube el original. Pasa con las fotos que
 *    ya venían optimizadas: recomprimir una imagen buena la deja igual de
 *    pesada y con menos calidad.
 */
export async function optimizarImagen(
  buffer: Buffer,
  mime: string,
  ext: string,
): Promise<ImagenLista> {
  const original: ImagenLista = { buffer, mime, ext };
  if (!planDeImagen(mime, undefined).optimizar) return original;

  try {
    const imagen = sharp(buffer, { failOn: 'none' });
    const { width } = await imagen.metadata();
    const plan = planDeImagen(mime, width);

    const optimizado = await imagen
      .rotate() // respeta la orientación EXIF: sin esto las fotos de celular salen acostadas
      // El ancho ya viene acotado por `planDeImagen`, que nunca devuelve más
      // que el original. Poner además `withoutEnlargement` sería la misma
      // guarda dos veces, y con las dos ninguna prueba puede distinguir cuál
      // está actuando.
      .resize({ width: plan.anchoMaximo })
      .webp({ quality: plan.calidad })
      .toBuffer();

    if (optimizado.length >= buffer.length) {
      log.debug(
        `La imagen ya estaba optimizada (${buffer.length} B); se deja como vino.`,
      );
      return original;
    }

    log.log(
      `Imagen optimizada: ${Math.round(buffer.length / 1024)} KB → ` +
        `${Math.round(optimizado.length / 1024)} KB`,
    );
    return { buffer: optimizado, mime: 'image/webp', ext: 'webp' };
  } catch (e) {
    log.warn(
      `No se pudo optimizar la imagen, se sube tal cual: ${(e as Error).message}`,
    );
    return original;
  }
}
