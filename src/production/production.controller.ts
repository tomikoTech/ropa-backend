import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ProductionService } from './production.service.js';
import { CreateProductionDto } from './dto/create-production.dto.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { TenantId } from '../common/decorators/tenant-id.decorator.js';
import { User } from '../users/entities/user.entity.js';

@ApiTags('Producción')
@ApiBearerAuth()
@Controller('production')
export class ProductionController {
  constructor(private readonly productionService: ProductionService) {}

  @Post()
  @ApiOperation({
    summary: 'Registrar producción (consume esencias, produce lociones)',
  })
  create(
    @Body() dto: CreateProductionDto,
    @CurrentUser() user: User,
    @TenantId() tenantId: string,
  ) {
    return this.productionService.create(dto, user.id, tenantId);
  }

  @Get()
  @ApiOperation({ summary: 'Listar producciones' })
  findAll(@TenantId() tenantId: string) {
    return this.productionService.findAll(tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de una producción' })
  findOne(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.productionService.findOne(id, tenantId);
  }
}
