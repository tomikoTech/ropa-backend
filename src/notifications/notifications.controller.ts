import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service.js';
import { UserId } from '../common/decorators/user-id.decorator.js';
import { TenantId } from '../common/decorators/tenant-id.decorator.js';

/**
 * La campanita: cada quien ve sus propios avisos. No hay endpoint para crearlos
 * a mano — los crea el sistema cuando pasa algo (una solicitud, una venta por
 * autorizar, un faltante).
 */
@ApiTags('Notificaciones')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Mis avisos (más recientes primero)' })
  @ApiQuery({ name: 'unread', required: false })
  @ApiQuery({ name: 'limit', required: false })
  listar(
    @UserId() userId: string,
    @TenantId() tenantId: string,
    @Query('unread') unread?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.listar(userId, tenantId, {
      soloNoLeidas: unread === 'true',
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Cuántos avisos sin leer tengo' })
  async contar(@UserId() userId: string, @TenantId() tenantId: string) {
    return { count: await this.service.contarNoLeidas(userId, tenantId) };
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Marcar un aviso como leído' })
  async marcar(
    @Param('id', ParseUUIDPipe) id: string,
    @UserId() userId: string,
    @TenantId() tenantId: string,
  ) {
    await this.service.marcarLeida(id, userId, tenantId);
    return { ok: true };
  }

  @Post('read-all')
  @ApiOperation({ summary: 'Marcar todos mis avisos como leídos' })
  async marcarTodas(@UserId() userId: string, @TenantId() tenantId: string) {
    await this.service.marcarTodasLeidas(userId, tenantId);
    return { ok: true };
  }
}
