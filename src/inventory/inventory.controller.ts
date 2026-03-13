import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { InventoryService } from './inventory.service.js';
import { CreateWarehouseDto } from './dto/create-warehouse.dto.js';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto.js';
import { AdjustStockDto } from './dto/adjust-stock.dto.js';
import { TransferStockDto } from './dto/transfer-stock.dto.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { TenantId } from '../common/decorators/tenant-id.decorator.js';
import { User } from '../users/entities/user.entity.js';
import { MovementType } from '../common/enums/movement-type.enum.js';

@ApiTags('Inventario')
@ApiBearerAuth()
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  // ─── Warehouses ───

  @Post('warehouses')
  @ApiOperation({ summary: 'Crear bodega' })
  createWarehouse(
    @Body() dto: CreateWarehouseDto,
    @TenantId() tenantId: string,
  ) {
    return this.inventoryService.createWarehouse(dto, tenantId);
  }

  @Get('warehouses')
  @ApiOperation({ summary: 'Listar bodegas' })
  findAllWarehouses(@TenantId() tenantId: string) {
    return this.inventoryService.findAllWarehouses(tenantId);
  }

  @Get('warehouses/:id')
  @ApiOperation({ summary: 'Obtener bodega por ID' })
  findWarehouse(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantId() tenantId: string,
  ) {
    return this.inventoryService.findWarehouse(id, tenantId);
  }

  @Patch('warehouses/:id')
  @ApiOperation({ summary: 'Actualizar bodega' })
  updateWarehouse(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWarehouseDto,
    @TenantId() tenantId: string,
  ) {
    return this.inventoryService.updateWarehouse(id, dto, tenantId);
  }

  @Delete('warehouses/:id')
  @ApiOperation({ summary: 'Eliminar bodega' })
  removeWarehouse(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantId() tenantId: string,
  ) {
    return this.inventoryService.removeWarehouse(id, tenantId);
  }

  // ─── Stock ───

  @Get('stock')
  @ApiOperation({ summary: 'Obtener todo el stock' })
  getAllStock(@TenantId() tenantId: string) {
    return this.inventoryService.getAllStock(tenantId);
  }

  @Get('stock/low')
  @ApiOperation({ summary: 'Stock por debajo del mínimo' })
  getLowStock(@TenantId() tenantId: string) {
    return this.inventoryService.getLowStock(tenantId);
  }

  @Get('stock/warehouse/:warehouseId')
  @ApiOperation({ summary: 'Stock por bodega' })
  getStockByWarehouse(
    @Param('warehouseId', ParseUUIDPipe) warehouseId: string,
    @TenantId() tenantId: string,
  ) {
    return this.inventoryService.getStockByWarehouse(warehouseId, tenantId);
  }

  @Get('stock/variant/:variantId')
  @ApiOperation({ summary: 'Stock por variante en todas las bodegas' })
  getStockByVariant(
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @TenantId() tenantId: string,
  ) {
    return this.inventoryService.getStockByVariant(variantId, tenantId);
  }

  // ─── Adjustments ───

  @Post('adjust')
  @ApiOperation({ summary: 'Ajustar stock (entrada, salida, ajuste)' })
  adjustStock(
    @Body() dto: AdjustStockDto,
    @CurrentUser() user: User,
    @TenantId() tenantId: string,
  ) {
    return this.inventoryService.adjustStock(dto, user.id, tenantId);
  }

  // ─── Transfers ───

  @Post('transfer')
  @ApiOperation({ summary: 'Trasladar stock entre bodegas' })
  transferStock(
    @Body() dto: TransferStockDto,
    @CurrentUser() user: User,
    @TenantId() tenantId: string,
  ) {
    return this.inventoryService.transferStock(dto, user.id, tenantId);
  }

  // ─── Movements ───

  @Get('movements')
  @ApiOperation({ summary: 'Historial de movimientos' })
  @ApiQuery({ name: 'warehouseId', required: false })
  @ApiQuery({ name: 'variantId', required: false })
  @ApiQuery({ name: 'movementType', required: false, enum: MovementType })
  @ApiQuery({ name: 'limit', required: false })
  getMovements(
    @TenantId() tenantId: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('variantId') variantId?: string,
    @Query('movementType') movementType?: MovementType,
    @Query('limit') limit?: string,
  ) {
    return this.inventoryService.getMovements(tenantId, {
      warehouseId,
      variantId,
      movementType,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  // ─── Min Stock ───

  @Patch('stock/min/:variantId/:warehouseId')
  @ApiOperation({ summary: 'Configurar stock mínimo' })
  setMinStock(
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Param('warehouseId', ParseUUIDPipe) warehouseId: string,
    @Body('minStock') minStock: number,
    @TenantId() tenantId: string,
  ) {
    return this.inventoryService.setMinStock(
      variantId,
      warehouseId,
      minStock,
      tenantId,
    );
  }
}
