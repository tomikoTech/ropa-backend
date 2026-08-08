import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TenantId } from '../common/decorators/tenant-id.decorator.js';
import { CreatePromoterDto, UpdatePromoterDto } from './promoters.dto.js';
import { PromotersService } from './promoters.service.js';

@ApiTags('Impulsadores')
@ApiBearerAuth()
@Controller('promoters')
export class PromotersController {
  constructor(private readonly service: PromotersService) {}

  @Get()
  findAll(
    @TenantId() tenantId: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.service.findAll(tenantId, includeInactive === 'true');
  }

  @Post()
  create(@Body() dto: CreatePromoterDto, @TenantId() tenantId: string) {
    return this.service.create(dto, tenantId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePromoterDto,
    @TenantId() tenantId: string,
  ) {
    return this.service.update(id, dto, tenantId);
  }
}
