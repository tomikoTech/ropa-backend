import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AssistantService } from './assistant.service.js';
import { ChatDto } from './dto/chat.dto.js';

@ApiTags('Asistente (Pintoso)')
@ApiBearerAuth()
@Controller('assistant')
export class AssistantController {
  constructor(private readonly service: AssistantService) {}

  @Post('chat')
  @ApiOperation({ summary: 'Preguntarle algo a Pintoso (asistente de ayuda)' })
  // Tope propio: atender no necesita ráfagas, y frena abuso o un bucle en el
  // navegador. El guard global de JWT ya exige sesión.
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  chat(@Body() dto: ChatDto) {
    return this.service.chat(dto.messages);
  }
}
