import {
  BadRequestException,
  Controller,
  Delete,
  Param,
  Post,
  Query,
  ServiceUnavailableException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { EXT_BY_MIME, R2Service } from './r2.service.js';

// Carpeta destino: un solo segmento seguro (sin slashes ni traversal).
const FOLDER_RE = /^[a-z0-9-]{1,32}$/;
const MAX_SIZE = 15 * 1024 * 1024; // 15 MB (cubre imágenes y videos cortos)

@ApiTags('uploads')
@Controller('uploads')
export class UploadsController {
  constructor(private readonly r2: R2Service) {}

  /** Sube un archivo a R2 bajo la carpeta indicada. Devuelve { url }. */
  @Post(':folder')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_SIZE } }))
  async upload(
    @Param('folder') folder: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<{ url: string }> {
    if (!this.r2.isConfigured()) {
      throw new ServiceUnavailableException(
        'El almacenamiento de archivos no está configurado',
      );
    }
    if (!file) throw new BadRequestException('No se recibió ningún archivo');
    if (!FOLDER_RE.test(folder)) {
      throw new BadRequestException('Carpeta de destino inválida');
    }
    const ext = EXT_BY_MIME[file.mimetype];
    if (!ext) {
      throw new BadRequestException(
        `Tipo de archivo no permitido: ${file.mimetype}`,
      );
    }
    const url = await this.r2.upload(folder, file.buffer, file.mimetype, ext);
    return { url };
  }

  /** Elimina un archivo de R2 por su URL pública. */
  @Delete()
  async remove(@Query('url') url: string): Promise<{ ok: boolean }> {
    if (url) await this.r2.deleteByUrl(url);
    return { ok: true };
  }
}
