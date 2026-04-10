import {
  Controller,
  Get,
  Patch,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { TenantId } from '../common/decorators/tenant-id.decorator.js';
import { UserId } from '../common/decorators/user-id.decorator.js';
import { StoreSettingsService } from './store-settings.service.js';
import { UpdateStoreSettingsDto } from './dto/update-store-settings.dto.js';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto.js';
import { EcommerceOrderStatus } from '../common/enums/ecommerce-order-status.enum.js';

@ApiTags('Tienda Online (Admin)')
@ApiBearerAuth()
@Controller('store-settings')
export class StoreSettingsController {
  constructor(private readonly storeSettingsService: StoreSettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Obtener configuración de tienda online' })
  getSettings(@TenantId() tenantId: string) {
    return this.storeSettingsService.getSettings(tenantId);
  }

  @Patch()
  @ApiOperation({ summary: 'Actualizar configuración de tienda online' })
  updateSettings(
    @TenantId() tenantId: string,
    @Body() dto: UpdateStoreSettingsDto,
  ) {
    return this.storeSettingsService.updateSettings(tenantId, dto);
  }

  @Get('orders')
  @ApiOperation({ summary: 'Listar pedidos e-commerce' })
  @ApiQuery({ name: 'status', required: false, enum: EcommerceOrderStatus })
  findAllOrders(
    @TenantId() tenantId: string,
    @Query('status') status?: EcommerceOrderStatus,
  ) {
    return this.storeSettingsService.findAllOrders(tenantId, { status });
  }

  @Get('orders/:id')
  @ApiOperation({ summary: 'Detalle de pedido e-commerce' })
  findOneOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantId() tenantId: string,
  ) {
    return this.storeSettingsService.findOneOrder(id, tenantId);
  }

  @Patch('orders/:id/status')
  @ApiOperation({ summary: 'Actualizar estado de pedido e-commerce' })
  updateOrderStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrderStatusDto,
    @TenantId() tenantId: string,
  ) {
    return this.storeSettingsService.updateOrderStatus(id, dto, tenantId);
  }

  @Patch('orders/:id/finalize')
  @ApiOperation({
    summary:
      'Finalizar pedido e-commerce (deducir stock, marcar como entregado)',
  })
  finalizeOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @UserId() userId: string,
    @TenantId() tenantId: string,
    @Body() body: { warehouseId?: string },
  ) {
    return this.storeSettingsService.finalizeOrder(
      id,
      userId,
      tenantId,
      body?.warehouseId,
    );
  }

  @Patch('orders/:id/cancel')
  @ApiOperation({ summary: 'Cancelar pedido e-commerce' })
  cancelOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @UserId() userId: string,
    @TenantId() tenantId: string,
  ) {
    return this.storeSettingsService.cancelOrder(id, userId, tenantId);
  }

  @Patch('orders/:id/shipping-status')
  @ApiOperation({ summary: 'Actualizar estado de envío' })
  updateShippingStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body()
    body: {
      shippingStatus: string;
      shippingTrackingCode?: string;
      shippingCarrier?: string;
    },
    @TenantId() tenantId: string,
  ) {
    return this.storeSettingsService.updateShippingStatus(id, tenantId, body);
  }

  @Patch('orders/:id/confirm-pickup')
  @ApiOperation({ summary: 'Confirmar recogida de pedido en tienda' })
  confirmPickup(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantId() tenantId: string,
  ) {
    return this.storeSettingsService.confirmPickup(id, tenantId);
  }

  @Patch('orders/:id/confirm-cod')
  @ApiOperation({ summary: 'Confirmar pago contraentrega' })
  confirmCodPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantId() tenantId: string,
  ) {
    return this.storeSettingsService.confirmCodPayment(id, tenantId);
  }
}
