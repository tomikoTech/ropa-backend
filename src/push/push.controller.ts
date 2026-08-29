import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsObject, IsString } from 'class-validator';
import { PushService } from './push.service.js';
import { UserId } from '../common/decorators/user-id.decorator.js';
import { TenantId } from '../common/decorators/tenant-id.decorator.js';

class SubscribeDto {
  @IsString()
  endpoint: string;

  @IsObject()
  keys: { p256dh: string; auth: string };
}

class UnsubscribeDto {
  @IsString()
  endpoint: string;
}

/**
 * Suscripción del dispositivo al push. La clave pública VAPID se entrega acá
 * para que el navegador arme la suscripción (es pública, no es secreto).
 */
@ApiTags('Push')
@ApiBearerAuth()
@Controller('push')
export class PushController {
  constructor(private readonly push: PushService) {}

  @Get('public-key')
  @ApiOperation({ summary: 'Clave pública VAPID (para suscribirse)' })
  publicKey() {
    return { publicKey: this.push.clavePublica(), enabled: this.push.estaHabilitado() };
  }

  @Post('subscribe')
  @ApiOperation({ summary: 'Registrar este dispositivo para recibir push' })
  async subscribe(
    @Body() dto: SubscribeDto,
    @UserId() userId: string,
    @TenantId() tenantId: string,
    @Req() req: Request,
  ) {
    await this.push.suscribir(userId, tenantId, dto, req.headers['user-agent'] ?? null);
    return { ok: true };
  }

  @Post('unsubscribe')
  @ApiOperation({ summary: 'Dar de baja este dispositivo' })
  async unsubscribe(@Body() dto: UnsubscribeDto) {
    await this.push.desuscribir(dto.endpoint);
    return { ok: true };
  }
}
