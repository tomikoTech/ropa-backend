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
import { AccessService } from '../access/access.service.js';

@ApiTags('Inventario')
@ApiBearerAuth()
@Controller('inventory')
export class InventoryController {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly access: AccessService,
  ) {}

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
  async findAllWarehouses(
    @CurrentUser() user: User,
    @TenantId() tenantId: string,
  ) {
    // Si el usuario tiene bodegas asignadas (F8), solo ve las suyas: con esto
    // todos los desplegables de la aplicación quedan acotados de una vez.
    const all = await this.inventoryService.findAllWarehouses(tenantId);
    return this.access.filterWarehouses(user.id, all);
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
  @ApiOperation({ summary: 'Stock por debajo del mínimo (reposición)' })
  getLowStock(@TenantId() tenantId: string) {
    return this.inventoryService.getLowStock(tenantId);
  }

  @Get('leftovers')
  @ApiOperation({ summary: 'Puntas: referencias con pocas tallas restantes' })
  @ApiQuery({ name: 'maxSizes', required: false })
  getLeftovers(
    @TenantId() tenantId: string,
    @Query('maxSizes') maxSizes?: string,
  ) {
    return this.inventoryService.getLeftovers(
      tenantId,
      maxSizes ? Number(maxSizes) : 2,
    );
  }

  @Get('lotes')
  @ApiOperation({
    summary: 'Resumen por lote/pedido (cuánto queda de cada uno)',
  })
  getLotes(@TenantId() tenantId: string) {
    return this.inventoryService.getLotes(tenantId);
  }

  @Get('stock/summary-by-product')
  @ApiOperation({
    summary: 'Stock total por producto (para la lista de Productos)',
  })
  getStockSummaryByProduct(@TenantId() tenantId: string) {
    return this.inventoryService.getStockSummaryByProduct(tenantId);
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
    // La bodega la valida `WarehouseScopeGuard` (F8).
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
    // Las dos puntas (origen y destino) las valida `WarehouseScopeGuard`, que
    // recoge cualquier campo que nombre una bodega.
    return this.inventoryService.transferStock(dto, user.id, tenantId);
  }

  // ─── Remisiones (traslados con confirmación) y préstamos ───

  @Get('transfers')
  @ApiOperation({ summary: 'Listar remisiones/préstamos' })
  @ApiQuery({ name: 'type', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'warehouseId', required: false })
  listTransfers(
    @TenantId() tenantId: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('warehouseId') warehouseId?: string,
  ) {
    return this.inventoryService.listTransfers(tenantId, {
      type,
      status,
      warehouseId,
    });
  }

  @Post('transfers/:id/receive')
  @ApiOperation({ summary: 'Recibir una remisión (traslado)' })
  receiveTransfer(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @TenantId() tenantId: string,
  ) {
    return this.inventoryService.receiveTransfer(id, user.id, tenantId);
  }

  @Post('transfers/:id/cancel')
  @ApiOperation({ summary: 'Cancelar una remisión pendiente' })
  cancelTransfer(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @TenantId() tenantId: string,
  ) {
    return this.inventoryService.cancelTransfer(id, user.id, tenantId);
  }

  @Post('loans')
  @ApiOperation({ summary: 'Crear un préstamo rápido entre locales' })
  createLoan(
    @Body() dto: TransferStockDto,
    @CurrentUser() user: User,
    @TenantId() tenantId: string,
  ) {
    return this.inventoryService.createLoan(dto, user.id, tenantId);
  }

  @Post('loans/:id/return')
  @ApiOperation({ summary: 'Retornar un préstamo (devolver a origen)' })
  returnLoan(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @TenantId() tenantId: string,
  ) {
    return this.inventoryService.returnLoan(id, user.id, tenantId);
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

  @Patch('stock/min-by-warehouse/:warehouseId')
  @ApiOperation({ summary: 'Fijar el mínimo de toda una bodega de una vez' })
  setMinStockByWarehouse(
    @Param('warehouseId', ParseUUIDPipe) warehouseId: string,
    @Body('minStock') minStock: number,
    @TenantId() tenantId: string,
  ) {
    return this.inventoryService.setMinStockByWarehouse(
      warehouseId,
      minStock,
      tenantId,
    );
  }
}
