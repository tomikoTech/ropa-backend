import { Controller, Get, Patch, Body, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator.js';
import { TenantId } from '../common/decorators/tenant-id.decorator.js';
import { BotConfigService } from './bot-config.service.js';
import { UpdateBotConfigDto } from './dto/update-bot-config.dto.js';

@ApiTags('Bot Config')
@Controller()
export class BotConfigController {
  constructor(private readonly botConfigService: BotConfigService) {}

  // Public endpoint — consumed by the bot
  @Public()
  @Get('storefront/:tenantSlug/bot-config')
  @ApiOperation({ summary: 'Get bot config for store (public)' })
  async getPublicBotConfig(@Param('tenantSlug') tenantSlug: string) {
    return this.botConfigService.getByStoreSlug(tenantSlug);
  }

  // Admin endpoints — consumed by POS frontend
  @Get('bot-config')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get bot config for current tenant' })
  async getBotConfig(@TenantId() tenantId: string) {
    return this.botConfigService.getByTenantId(tenantId);
  }

  @Patch('bot-config')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update bot config for current tenant' })
  async updateBotConfig(
    @TenantId() tenantId: string,
    @Body() dto: UpdateBotConfigDto,
  ) {
    return this.botConfigService.update(tenantId, dto);
  }
}
