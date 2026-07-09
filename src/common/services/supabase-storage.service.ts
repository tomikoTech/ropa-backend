import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const BUCKET = 'mipinta-bucket';

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/**
 * Subida de imágenes al Storage de Supabase desde el backend.
 *
 * El frontend sube con la anon key; aquí usamos preferentemente la service-role
 * key (SUPABASE_SERVICE_ROLE_KEY) y caemos a la anon key si no está configurada.
 * Mismo bucket (`mipinta-bucket`) y carpeta (`products/`) que el frontend, de modo
 * que las URLs resultantes son consistentes con las ya existentes.
 */
@Injectable()
export class SupabaseStorageService {
  private readonly logger = new Logger(SupabaseStorageService.name);
  private client: SupabaseClient | null = null;

  constructor(private readonly configService: ConfigService) {}

  private getClient(): SupabaseClient {
    if (this.client) return this.client;

    const url = this.configService.get<string>('SUPABASE_URL');
    const key =
      this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY') ||
      this.configService.get<string>('SUPABASE_ANON_KEY');

    if (!url || !key) {
      throw new InternalServerErrorException(
        'Almacenamiento de imágenes no configurado (falta SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)',
      );
    }

    this.client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    return this.client;
  }

  /**
   * Sube una imagen codificada en base64 (sin prefijo data:) y devuelve su URL
   * pública. `mime` determina la extensión; por defecto image/jpeg.
   */
  async uploadBase64Image(
    data: string,
    mime = 'image/jpeg',
    folder = 'products',
  ): Promise<string> {
    const client = this.getClient();

    const normalizedMime = mime.toLowerCase();
    const ext = MIME_EXT[normalizedMime] ?? 'jpg';

    // Acepta tanto base64 puro como data URLs ("data:image/...;base64,....").
    const base64 = data.includes(',') ? data.split(',').pop()! : data;
    let buffer: Buffer;
    try {
      buffer = Buffer.from(base64, 'base64');
    } catch {
      throw new InternalServerErrorException('Imagen base64 inválida');
    }
    if (buffer.length === 0) {
      throw new InternalServerErrorException('Imagen base64 vacía');
    }

    const rand = Math.random().toString(36).slice(2);
    const fileName = `${Date.now()}-${rand}.${ext}`;
    const path = `${folder}/${fileName}`;

    const { error } = await client.storage.from(BUCKET).upload(path, buffer, {
      cacheControl: '3600',
      upsert: false,
      contentType: normalizedMime,
    });

    if (error) {
      this.logger.error(`Error subiendo imagen a Supabase: ${error.message}`);
      throw new InternalServerErrorException(
        `No se pudo subir la imagen: ${error.message}`,
      );
    }

    const { data: pub } = client.storage.from(BUCKET).getPublicUrl(path);
    return pub.publicUrl;
  }
}
