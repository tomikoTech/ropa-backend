import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { randomBytes } from 'crypto';
import { optimizarImagen } from './optimizar-imagen.js';

/**
 * Extensión por MIME permitido (imágenes + videos cortos de producto).
 *
 * Vive acá y no en el controller porque la subida por base64 (el agente de
 * WhatsApp) tiene que aceptar exactamente los mismos tipos que la subida por
 * formulario.
 */
export const EXT_BY_MIME: Record<string, string> = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};

/**
 * Almacenamiento de archivos en Cloudflare R2 (compatible con S3).
 * Credenciales por env: R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
 * R2_BUCKET, R2_PUBLIC_URL. Reemplaza a Supabase Storage.
 */
@Injectable()
export class R2Service {
  private readonly logger = new Logger(R2Service.name);
  private readonly bucket = process.env.R2_BUCKET || '';
  private readonly publicUrl = (process.env.R2_PUBLIC_URL || '').replace(
    /\/+$/,
    '',
  );
  private readonly client: S3Client | null;

  constructor() {
    const endpoint = process.env.R2_ENDPOINT;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    if (endpoint && accessKeyId && secretAccessKey && this.bucket) {
      this.client = new S3Client({
        region: 'auto',
        endpoint,
        credentials: { accessKeyId, secretAccessKey },
      });
    } else {
      this.client = null;
      this.logger.warn(
        'R2 no configurado (faltan R2_ENDPOINT/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY/R2_BUCKET). Los uploads fallarán.',
      );
    }
  }

  isConfigured(): boolean {
    return !!(this.client && this.publicUrl);
  }

  /**
   * Sube un buffer a R2 en `<folder>/<timestamp>-<rand>.<ext>` y devuelve la URL
   * pública. `folder` debe venir ya validado por el controller.
   */
  async upload(
    folder: string,
    buffer: Buffer,
    contentType: string,
    ext: string,
  ): Promise<string> {
    if (!this.client) throw new Error('R2 no está configurado');

    // Todo pasa por acá —el formulario del admin y el base64 del bot de
    // WhatsApp— así que optimizar en este punto cubre los dos caminos.
    const listo = await optimizarImagen(buffer, contentType, ext);

    const key = `${folder}/${Date.now()}-${randomBytes(6).toString('hex')}.${listo.ext}`;
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: listo.buffer,
        ContentType: listo.mime,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
    return `${this.publicUrl}/${key}`;
  }

  /**
   * Sube una imagen codificada en base64 y devuelve su URL pública.
   *
   * Acepta base64 puro o data URL (`data:image/png;base64,...`). Lo usa el
   * agente de WhatsApp, que manda las fotos dentro del JSON en vez de como
   * archivo.
   */
  async uploadBase64Image(
    data: string,
    mime = 'image/jpeg',
    folder = 'products',
  ): Promise<string> {
    const normalizedMime = mime.toLowerCase();
    const ext = EXT_BY_MIME[normalizedMime];
    if (!ext) {
      throw new InternalServerErrorException(
        `Tipo de imagen no permitido: ${mime}`,
      );
    }

    const base64 = data.includes(',') ? data.split(',').pop()! : data;
    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length === 0) {
      throw new InternalServerErrorException('Imagen base64 vacía');
    }

    return this.upload(folder, buffer, normalizedMime, ext);
  }

  /** Elimina un objeto a partir de su URL pública. No-op si la URL no es nuestra. */
  async deleteByUrl(url: string): Promise<void> {
    if (!this.client || !url) return;
    const prefix = `${this.publicUrl}/`;
    if (!url.startsWith(prefix)) return;
    const key = url.slice(prefix.length);
    if (!key) return;
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch (e) {
      this.logger.warn(`No se pudo eliminar ${key}: ${(e as Error).message}`);
    }
  }
}
