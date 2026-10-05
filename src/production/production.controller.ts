import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ProductionService } from './production.service.js';
import { CreateProductionDto } from './dto/create-production.dto.js';
import {
  EntradaDeTerminadoDto,
  SalidaDeEsenciaDto,
} from './dto/produccion-simple.dto.js';
import { AjusteDeCostoDto } from './dto/ajuste-de-costo.dto.js';
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

  // ── Producción simple (perfumería): dos pasos separados a propósito ──
  @Get('esencias')
  @ApiOperation({ summary: 'Lo que queda de cada esencia, en gramos' })
  esencias(@TenantId() tenantId: string) {
    return this.productionService.existenciasDeEsencia(tenantId);
  }

  @Post('salida-de-esencia')
  @ApiOperation({ summary: 'César saca esencia para producir (gramos)' })
  sacarEsencia(
    @Body() dto: SalidaDeEsenciaDto,
    @CurrentUser() user: User,
    @TenantId() tenantId: string,
  ) {
    return this.productionService.sacarEsencia(dto, user.id, tenantId);
  }

  @Post('entrada-de-terminado')
  @ApiOperation({
    summary: 'Entran lociones terminadas: sale el frasco y queda el costo',
  })
  entrarTerminado(
    @Body() dto: EntradaDeTerminadoDto,
    @CurrentUser() user: User,
    @TenantId() tenantId: string,
  ) {
    return this.productionService.entrarTerminado(dto, user.id, tenantId);
  }

  // ── Costo de perfumes: cuánto sale cada uno y qué queda con descuento ──
  @Get('costos')
  @ApiOperation({
    summary:
      'Costo de cada perfume (frasco + esencia + mano de obra) y utilidad con cada descuento',
  })
  costos(@TenantId() tenantId: string) {
    return this.productionService.costosDePerfumes(tenantId);
  }

  @Patch('costos/:productId')
  @ApiOperation({
    summary: 'Mano de obra o costo del frasco a mano de un perfume',
  })
  ajustarCosto(
    @Param('productId') productId: string,
    @Body() dto: AjusteDeCostoDto,
    @TenantId() tenantId: string,
  ) {
    return this.productionService.ajustarCostoDePerfume(
      productId,
      dto,
      tenantId,
    );
  }

  @Get()
  @ApiOperation({ summary: 'Listar producciones (paginado)' })
  findAll(
    @TenantId() tenantId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.productionService.findAllPaginado(tenantId, { page, limit });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de una producción' })
  findOne(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.productionService.findOne(id, tenantId);
  }
}
