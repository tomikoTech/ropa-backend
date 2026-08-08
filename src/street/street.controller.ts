import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { StreetService } from './street.service.js';
import {
  CreateDispatchDto,
  CreateStreetSellerDto,
  SettleDispatchDto,
  UpdateStreetSellerDto,
} from './dto/street.dto.js';
import { TenantId } from '../common/decorators/tenant-id.decorator.js';
import { UserId } from '../common/decorators/user-id.decorator.js';

/**
 * Patinadores y remisión rápida (F6): la operación de calle.
 *
 * Los permisos los aplica el guard global; el módulo es `street` (ver
 * `access/module-registry.ts`), y la bodega del despacho la valida el guard de
 * bodegas porque viene en el cuerpo como `warehouseId`.
 */
@ApiTags('Calle')
@ApiBearerAuth()
@Controller('street')
export class StreetController {
  constructor(private readonly street: StreetService) {}

  // ── Patinadores ──────────────────────────────────────────────────────────

  @Get('sellers')
  @ApiOperation({ summary: 'Listar patinadores' })
  @ApiQuery({ name: 'includeInactive', required: false })
  listSellers(
    @TenantId() tenantId: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.street.listSellers(tenantId, includeInactive === 'true');
  }

  @Get('sellers/by-code/:code')
  @ApiOperation({
    summary: 'Buscar patinador por el código de su carnet (escáner)',
  })
  findByCode(@Param('code') code: string, @TenantId() tenantId: string) {
    return this.street.findSellerByCode(code, tenantId);
  }

  @Post('sellers')
  @ApiOperation({ summary: 'Crear patinador (el carnet se genera solo)' })
  createSeller(
    @Body() dto: CreateStreetSellerDto,
    @TenantId() tenantId: string,
  ) {
    return this.street.createSeller(dto, tenantId);
  }

  @Patch('sellers/:id')
  @ApiOperation({ summary: 'Editar o desactivar un patinador' })
  updateSeller(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStreetSellerDto,
    @TenantId() tenantId: string,
  ) {
    return this.street.updateSeller(id, dto, tenantId);
  }

  // ── Remisiones ───────────────────────────────────────────────────────────

  @Get('dispatches')
  @ApiOperation({ summary: 'Listar remisiones rápidas' })
  @ApiQuery({ name: 'streetSellerId', required: false })
  @ApiQuery({ name: 'warehouseId', required: false })
  @ApiQuery({ name: 'status', required: false })
  listDispatches(
    @TenantId() tenantId: string,
    @Query('streetSellerId') streetSellerId?: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('status') status?: string,
  ) {
    return this.street.listDispatches(
      { streetSellerId, warehouseId, status },
      tenantId,
    );
  }

  @Get('dispatches/:id')
  @ApiOperation({ summary: 'Una remisión con su cuadratura' })
  findDispatch(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantId() tenantId: string,
  ) {
    return this.street.findDispatch(id, tenantId);
  }

  @Post('dispatches')
  @ApiOperation({ summary: 'Despachar mercancía a un patinador' })
  createDispatch(
    @Body() dto: CreateDispatchDto,
    @UserId() userId: string,
    @TenantId() tenantId: string,
  ) {
    return this.street.createDispatch(dto, userId, tenantId);
  }

  @Post('dispatches/:id/settle')
  @ApiOperation({
    summary: 'Cuadrar: qué vendió, qué devolvió y qué falta (genera la venta)',
  })
  settle(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SettleDispatchDto,
    @UserId() userId: string,
    @TenantId() tenantId: string,
  ) {
    return this.street.settle(id, dto, userId, tenantId);
  }

  @Post('dispatches/:id/cancel')
  @ApiOperation({
    summary: 'Anular: la mercancía vuelve completa al inventario',
  })
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @UserId() userId: string,
    @TenantId() tenantId: string,
  ) {
    return this.street.cancelDispatch(id, userId, tenantId);
  }
}
