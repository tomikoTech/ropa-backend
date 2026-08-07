import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PurchaseBoxesService } from './purchase-boxes.service.js';
import {
  CreateBoxLineDto,
  UpdateBoxLineDto,
  UpdateImportCostsDto,
} from './dto/purchase-box.dto.js';
import { TenantId } from '../common/decorators/tenant-id.decorator.js';

/**
 * Compra por cajas y costeo de importación.
 * Cuelga de la orden de compra existente: una orden puede tener líneas
 * clásicas (por variante), líneas por caja, o ambas.
 */
@ApiTags('Compras - Cajas e importación')
@ApiBearerAuth()
@Controller('purchases')
export class PurchaseBoxesController {
  constructor(private readonly boxes: PurchaseBoxesService) {}

  @Get(':id/box-lines')
  @ApiOperation({ summary: 'Renglones por caja de la orden' })
  findLines(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantId() tenantId: string,
  ) {
    return this.boxes.findLines(id, tenantId);
  }

  @Post(':id/box-lines')
  @ApiOperation({ summary: 'Agregar renglón por cajas' })
  addLine(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateBoxLineDto,
    @TenantId() tenantId: string,
  ) {
    return this.boxes.addLine(id, dto, tenantId);
  }

  @Patch('box-lines/:lineId')
  @ApiOperation({ summary: 'Actualizar renglón por cajas' })
  updateLine(
    @Param('lineId', ParseUUIDPipe) lineId: string,
    @Body() dto: UpdateBoxLineDto,
    @TenantId() tenantId: string,
  ) {
    return this.boxes.updateLine(lineId, dto, tenantId);
  }

  @Delete('box-lines/:lineId')
  @ApiOperation({ summary: 'Eliminar renglón por cajas' })
  removeLine(
    @Param('lineId', ParseUUIDPipe) lineId: string,
    @TenantId() tenantId: string,
  ) {
    return this.boxes.removeLine(lineId, tenantId);
  }

  @Patch(':id/import-costs')
  @ApiOperation({ summary: 'Tasa de cambio, fletes y fecha de llegada' })
  updateImportCosts(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateImportCostsDto,
    @TenantId() tenantId: string,
  ) {
    return this.boxes.updateImportCosts(id, dto, tenantId);
  }

  @Get(':id/landed-cost')
  @ApiOperation({
    summary: 'Costo puesto en bodega, con los fletes ya repartidos',
  })
  getLandedCost(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantId() tenantId: string,
  ) {
    return this.boxes.getLandedCost(id, tenantId);
  }
}
