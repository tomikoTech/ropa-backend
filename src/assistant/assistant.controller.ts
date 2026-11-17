import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { TenantId } from '../common/decorators/tenant-id.decorator.js';
import {
  AssistantService,
  type UsuarioDelAsistente,
} from './assistant.service.js';
import { ChatDto } from './dto/chat.dto.js';
import { ConsultaDto } from './dto/consulta.dto.js';

@ApiTags('Asistente (Pintoso)')
@ApiBearerAuth()
@Controller('assistant')
export class AssistantController {
  constructor(private readonly service: AssistantService) {}

  @Post('chat')
  @ApiOperation({
    summary: 'Preguntarle algo a Pintoso: ayuda de uso o datos de la tienda',
  })
  // Tope propio: atender no necesita ráfagas, y frena abuso o un bucle en el
  // navegador. El guard global de JWT ya exige sesión.
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  chat(
    @Body() dto: ChatDto,
    @CurrentUser() usuario: UsuarioDelAsistente,
    @TenantId() tenantId: string,
  ) {
    return this.service.chat(dto.messages, usuario, tenantId);
  }

  @Post('consulta')
  @ApiOperation({
    summary:
      'Volver a correr una tabla del asistente con otro filtro (clic en una celda)',
  })
  // Sin modelo de por medio: es una consulta de reporte, con su propio tope.
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  consulta(
    @Body() dto: ConsultaDto,
    @CurrentUser() usuario: UsuarioDelAsistente,
    @TenantId() tenantId: string,
  ) {
    return this.service.consultar(
      dto.herramienta,
      dto.argumentos,
      usuario,
      tenantId,
      dto.clic,
    );
  }
}
