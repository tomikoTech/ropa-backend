import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PromotionsService } from './promotions.service.js';
import { CreatePromotionDto } from './dto/create-promotion.dto.js';
import { UpdatePromotionDto } from './dto/update-promotion.dto.js';
import { TenantId } from '../common/decorators/tenant-id.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Role } from '../common/enums/role.enum.js';

@ApiTags('Promociones')
@ApiBearerAuth()
@Controller('promotions')
export class PromotionsController {
  constructor(private readonly promotionsService: PromotionsService) {}

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Crear promoción' })
  create(
    @Body() dto: CreatePromotionDto,
    @TenantId() tenantId: string,
  ) {
    return this.promotionsService.create(dto, tenantId);
  }

  @Get()
  @ApiOperation({ summary: 'Listar todas las promociones' })
  findAll(@TenantId() tenantId: string) {
    return this.promotionsService.findAll(tenantId);
  }

  @Get('active')
  @ApiOperation({ summary: 'Listar promociones activas vigentes' })
  findActive(@TenantId() tenantId: string) {
    return this.promotionsService.findActive(tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener promoción por ID' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantId() tenantId: string,
  ) {
    return this.promotionsService.findOne(id, tenantId);
  }

  @Put(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Actualizar promoción' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePromotionDto,
    @TenantId() tenantId: string,
  ) {
    return this.promotionsService.update(id, dto, tenantId);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Eliminar promoción' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantId() tenantId: string,
  ) {
    return this.promotionsService.remove(id, tenantId);
  }
}
