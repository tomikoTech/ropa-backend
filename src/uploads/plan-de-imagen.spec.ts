import { planDeImagen, ANCHO_MAXIMO, CALIDAD } from './plan-de-imagen.js';

/**
 * Qué hacer con cada archivo que se sube.
 *
 * Las fotos entran tal cual llegan: las del bucket promedian **660 KB** cuando
 * una foto de producto bien hecha pesa 80–150 KB. No es un problema de costo
 * —el almacenamiento son centavos— sino de quien mira desde el teléfono: una
 * vitrina de treinta productos son veinte megas y varios segundos de espera.
 */
describe('planDeImagen', () => {
  it('una foto grande se reduce y se recomprime', () => {
    const plan = planDeImagen('image/jpeg', 4000);
    expect(plan.optimizar).toBe(true);
    expect(plan.anchoMaximo).toBe(ANCHO_MAXIMO);
    expect(plan.calidad).toBe(CALIDAD);
  });

  it('una foto más angosta que el máximo no se estira', () => {
    // Ampliar una foto pequeña la deja borrosa y encima pesando más.
    expect(planDeImagen('image/jpeg', 800).anchoMaximo).toBe(800);
  });

  it('una foto justo del ancho máximo se recomprime pero no se toca de tamaño', () => {
    expect(planDeImagen('image/png', ANCHO_MAXIMO).anchoMaximo).toBe(
      ANCHO_MAXIMO,
    );
  });

  it('el destino siempre es webp: es lo que mejor comprime una foto', () => {
    for (const mime of [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/avif',
    ]) {
      expect(planDeImagen(mime, 3000).formato).toBe('webp');
    }
  });

  it('un webp que ya viene también se optimiza', () => {
    // Es el caso real y el que motivó todo esto: las fotos del bucket **son**
    // webp y promedian 660 KB. Que ya tengan el formato de destino no
    // significa que estén optimizadas.
    expect(planDeImagen('image/webp', 3000).optimizar).toBe(true);
    expect(planDeImagen('image/avif', 3000).optimizar).toBe(true);
  });

  it('un gif se deja como está', () => {
    // Suele ser animado y convertirlo a webp fijo se come la animación.
    expect(planDeImagen('image/gif', 3000).optimizar).toBe(false);
  });

  it('un video se deja como está', () => {
    for (const mime of ['video/mp4', 'video/webm', 'video/quicktime']) {
      expect(planDeImagen(mime, 3000).optimizar).toBe(false);
    }
  });

  it('lo que no se reconoce se deja como está', () => {
    // Mejor guardar el original que arriesgarse a corromperlo.
    expect(planDeImagen('application/pdf', 3000).optimizar).toBe(false);
    expect(planDeImagen('', 3000).optimizar).toBe(false);
  });

  it('sin saber el ancho, usa el máximo', () => {
    // Es lo que pasa cuando la imagen no se pudo leer: reducir a 1400 nunca
    // agranda nada, así que es el lado seguro.
    expect(planDeImagen('image/jpeg', undefined).anchoMaximo).toBe(
      ANCHO_MAXIMO,
    );
    expect(planDeImagen('image/jpeg', 0).anchoMaximo).toBe(ANCHO_MAXIMO);
  });

  it('no distingue mayúsculas en el tipo', () => {
    expect(planDeImagen('IMAGE/JPEG', 3000).optimizar).toBe(true);
    expect(planDeImagen('Video/MP4', 3000).optimizar).toBe(false);
  });
});
