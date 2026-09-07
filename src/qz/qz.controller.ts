import { Controller, Get, Post, Body, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { createSign } from 'crypto';
import { Public } from '../common/decorators/public.decorator.js';

/**
 * Firma para QZ Tray (impresión directa de etiquetas).
 *
 * QZ Tray no deja **recordar** el permiso de un sitio sin firmar: cada
 * impresión abre el aviso «An anonymous request wants to connect». Firmando las
 * peticiones, el aviso desaparece y la tienda imprime sin interrupciones.
 *
 * La **llave privada** vive solo en el servidor (`QZ_PRIVATE_KEY`); al
 * navegador únicamente va el certificado público y la firma de cada petición.
 * Si no hay llave configurada, esto responde vacío y la aplicación sigue
 * funcionando como hasta ahora (con el aviso de QZ).
 */
@ApiTags('Impresión - QZ Tray')
@ApiBearerAuth()
@Controller('qz')
export class QzController {
  /**
   * El certificado público que la tienda instala en QZ Tray. Es público a
   * propósito: sin él, QZ no puede comprobar la firma.
   */
  @Public()
  @Get('certificate')
  @ApiOperation({ summary: 'Certificado público para QZ Tray' })
  certificate(): { certificate: string | null } {
    const cert = process.env.QZ_CERTIFICATE?.trim();
    return { certificate: cert ? cert.replace(/\\n/g, '\n') : null };
  }

  /**
   * Firma la petición que QZ Tray va a ejecutar. QZ manda el texto exacto y
   * espera su firma en base64; no se firma nada más.
   */
  @Post('sign')
  @ApiOperation({ summary: 'Firmar una petición de QZ Tray' })
  sign(@Body() body: { data?: string }): { signature: string | null } {
    const key = process.env.QZ_PRIVATE_KEY?.replace(/\\n/g, '\n');
    if (!key) return { signature: null };
    const data = body?.data;
    if (typeof data !== 'string' || data.length === 0) {
      throw new BadRequestException('Falta el texto a firmar');
    }
    // Límite sano: lo que QZ manda son unos cientos de caracteres.
    if (data.length > 4096) {
      throw new BadRequestException('Petición demasiado larga');
    }
    const firma = createSign('SHA512').update(data).sign(key, 'base64');
    return { signature: firma };
  }
}
