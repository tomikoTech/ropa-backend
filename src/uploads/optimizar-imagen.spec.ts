import sharp from 'sharp';
import { optimizarImagen } from './optimizar-imagen.js';
import { ANCHO_MAXIMO } from './plan-de-imagen.js';

/**
 * La ejecución del plan, con imágenes de verdad.
 *
 * `plan-de-imagen.spec.ts` cubre la decisión; acá se comprueba que la
 * herramienta hace lo que la decisión dice, y sobre todo que **nunca pierde la
 * foto del cliente**: ante cualquier duda se guarda el original.
 */

/** Una foto con ruido: una imagen plana comprimiría de forma irreal. */
const foto = async (ancho: number, alto: number) => {
  const pixeles = Buffer.alloc(ancho * alto * 3);
  for (let i = 0; i < pixeles.length; i++) pixeles[i] = (i * 7919) % 256;
  return sharp(pixeles, { raw: { width: ancho, height: alto, channels: 3 } })
    .jpeg({ quality: 95 })
    .toBuffer();
};

describe('optimizarImagen', () => {
  it('una foto grande sale reducida al ancho máximo y en webp', async () => {
    const original = await foto(3000, 2000);
    const listo = await optimizarImagen(original, 'image/jpeg', 'jpg');

    expect(listo.mime).toBe('image/webp');
    expect(listo.ext).toBe('webp');
    const { width, height } = await sharp(listo.buffer).metadata();
    expect(width).toBe(ANCHO_MAXIMO);
    // Y conserva la proporción: 3000x2000 es 3:2.
    expect(height).toBe(Math.round((ANCHO_MAXIMO * 2000) / 3000));
    expect(listo.buffer.length).toBeLessThan(original.length);
  }, 30000);

  it('una foto más angosta que el máximo no se agranda', async () => {
    const original = await foto(600, 400);
    const listo = await optimizarImagen(original, 'image/jpeg', 'jpg');
    const { width } = await sharp(listo.buffer).metadata();
    expect(width).toBe(600);
  }, 30000);

  it('tampoco se agranda un png pequeño, que sí ahorraría al recomprimirse', async () => {
    // El caso anterior no alcanza para probar la regla: una foto pequeña
    // ampliada suele pesar más, y entonces la rechaza la salvaguarda de «si no
    // ahorra, deja el original» — no la regla del ancho.
    //
    // Un png sin comprimir es tan pesado que ampliarlo a 1400 en webp *sí*
    // ahorraría, así que la salvaguarda lo dejaría pasar. Lo único que impide
    // estirar la foto es el ancho que calcula `planDeImagen`.
    const png = await sharp(await foto(600, 400))
      .png({ compressionLevel: 0 })
      .toBuffer();
    const listo = await optimizarImagen(png, 'image/png', 'png');
    expect(listo.buffer.length).toBeLessThan(png.length); // sí se optimizó
    const { width } = await sharp(listo.buffer).metadata();
    expect(width).toBe(600);
  }, 30000);

  it('un video no se toca', async () => {
    const falso = Buffer.from('no soy una imagen');
    const listo = await optimizarImagen(falso, 'video/mp4', 'mp4');
    expect(listo.buffer).toBe(falso);
    expect(listo.mime).toBe('video/mp4');
    expect(listo.ext).toBe('mp4');
  });

  it('un gif animado no se toca: convertirlo se comería la animación', async () => {
    // Con un gif de verdad y con dos cuadros: uno falso lo rechazaría sharp de
    // todos modos y la prueba no estaría probando la regla, sino el error.
    const cuadro = await foto(40, 40);
    const animado = await sharp(cuadro, { animated: true })
      .gif({ loop: 0 })
      .toBuffer();
    const listo = await optimizarImagen(animado, 'image/gif', 'gif');
    expect(listo.buffer).toBe(animado);
    expect(listo.mime).toBe('image/gif');
    expect(listo.ext).toBe('gif');
  }, 30000);

  it('un archivo corrupto se sube tal cual en vez de tumbar el alta', async () => {
    // Perder la foto del cliente es peor que guardarla sin optimizar.
    const basura = Buffer.from('esto no es una imagen ni de lejos');
    const listo = await optimizarImagen(basura, 'image/jpeg', 'jpg');
    expect(listo.buffer).toBe(basura);
    expect(listo.mime).toBe('image/jpeg');
  }, 30000);

  it('si recomprimir no ahorra nada, se queda el original', async () => {
    // Una foto ya optimizada saldría igual de pesada y con menos calidad.
    const yaPequena = await sharp(await foto(200, 200))
      .webp({ quality: 40 })
      .toBuffer();
    const listo = await optimizarImagen(yaPequena, 'image/webp', 'webp');
    expect(listo.buffer).toBe(yaPequena);
  }, 30000);

  it('una foto de celular acostada sale derecha', async () => {
    // Sin `rotate()` la orientación EXIF se pierde al recomprimir y la foto
    // del producto aparece de lado en la tienda.
    const vertical = await sharp(await foto(2000, 3000))
      .withMetadata({ orientation: 6 }) // 90° según EXIF
      .toBuffer();
    const listo = await optimizarImagen(vertical, 'image/jpeg', 'jpg');
    const { width, height } = await sharp(listo.buffer).metadata();
    // Al aplicar la orientación, lo que era 2000x3000 queda 3000x2000.
    expect(width).toBeGreaterThan(height);
  }, 30000);
});
