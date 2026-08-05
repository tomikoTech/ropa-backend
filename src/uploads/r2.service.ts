import { Injectable, Logger } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { randomBytes } from 'crypto';

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
    const key = `${folder}/${Date.now()}-${randomBytes(6).toString('hex')}.${ext}`;
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
    return `${this.publicUrl}/${key}`;
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
