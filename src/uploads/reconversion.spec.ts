import { optimizarImagen } from './optimizar-imagen.js';
import sharp from 'sharp';

/**
 * Que la reconversion sirva de verdad.
 *
 * El script que reconvierte las fotos viejas se apoya en esto: si el WebP no
 * pesara menos, cambiarlas seria trabajo para nada —y peor, perder el
 * original a cambio de nada—.
 */
describe('reconvertir una foto que ya estaba', () => {
  /** Una foto de producto tipica: fotografica, no un dibujo plano. */
  async function fotoJpeg(ancho: number, alto: number): Promise<Buffer> {
    const ruido = Buffer.alloc(ancho * alto * 3);
    for (let i = 0; i < ruido.length; i += 3) {
      const x = (i / 3) % ancho;
      const y = Math.floor(i / 3 / ancho);
      ruido[i] = (x * 7 + y * 3) % 256;
      ruido[i + 1] = (x * 3 + y * 11) % 256;
      ruido[i + 2] = (x * 13 + y * 5) % 256;
    }
    return sharp(ruido, { raw: { width: ancho, height: alto, channels: 3 } })
      .jpeg({ quality: 95 })
      .toBuffer();
  }

  it('una foto grande sale mas liviana y en webp', async () => {
    const original = await fotoJpeg(2400, 1800);
    const listo = await optimizarImagen(original, 'image/jpeg', 'jpg');
    expect(listo.mime).toBe('image/webp');
    expect(listo.buffer.length).toBeLessThan(original.length);
  }, 30000);

  // El script no reemplaza nada que no baje de peso: cambiar una foto por otra
  // igual o mas pesada es perder el original a cambio de nada.
  it('y se sabe cuanto baja, para poder decidir', async () => {
    const original = await fotoJpeg(2000, 1500);
    const listo = await optimizarImagen(original, 'image/jpeg', 'jpg');
    const baja = 1 - listo.buffer.length / original.length;
    expect(baja).toBeGreaterThan(0);
  }, 30000);

  it('una foto ya pequena no se agranda', async () => {
    const original = await fotoJpeg(600, 400);
    const listo = await optimizarImagen(original, 'image/jpeg', 'jpg');
    const meta = await sharp(listo.buffer).metadata();
    expect(meta.width).toBe(600);
  }, 30000);
});
