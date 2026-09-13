import { Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantId } from '../common/decorators/tenant-id.decorator.js';
import { DocumentosService } from './documentos.service.js';

/**
 * `POST` y no `GET` a propósito: cada llamada **genera y sube** un archivo.
 * Un GET lo prefetcharía el navegador, lo cachearía un proxy y lo repetiría un
 * refresco, y cada repetición es un PDF más en R2.
 */
@ApiTags('Documentos')
@ApiBearerAuth()
@Controller('documentos')
export class DocumentosController {
  constructor(private readonly documentos: DocumentosService) {}

  @Post('ventas/:id/factura')
  @ApiOperation({
    summary: 'Factura en PDF, como enlace para mandar por WhatsApp',
    description:
      'Genera el PDF, lo aloja y devuelve el enlace. El mensaje de WhatsApp lleva el enlace en vez del texto de la factura.',
  })
  factura(@Param('id', ParseUUIDPipe) id: string, @TenantId() tenantId: string) {
    return this.documentos.enlaceDeFactura(id, tenantId);
  }

  @Post('clientes/:clientId/estado-de-cuenta')
  @ApiOperation({ summary: 'Estado de cuenta en PDF, como enlace para mandar por WhatsApp' })
  estadoDeCuenta(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @TenantId() tenantId: string,
  ) {
    return this.documentos.enlaceDeEstadoDeCuenta(clientId, tenantId);
  }
}
