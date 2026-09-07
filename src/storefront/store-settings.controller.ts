import {
  Controller,
  Get,
  Patch,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
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

  /**
   * El logo de la etiqueta, servido por nosotros.
   *
   * El logo vive en el almacenamiento de archivos (otro dominio) y el navegador
   * no puede leerlo para incrustarlo en la etiqueta: al imprimir salía **sin
   * logo**. Sirviéndolo desde acá es el mismo origen y se puede incrustar.
   *
   * Solo se trae la dirección guardada en los ajustes de ESA tienda: no es un
   * proxy de cualquier URL.
   */
  @Get('label-logo')
  @ApiOperation({ summary: 'Logo de la etiqueta (para incrustarlo al imprimir)' })
  async labelLogo(@TenantId() tenantId: string, @Res() res: Response) {
    const settings = await this.storeSettingsService.getSettings(tenantId);
    const url = settings.labelLogoUrl || settings.logoUrl;
    if (!url) {
      res.status(404).json({ message: 'La tienda no tiene logo de etiqueta' });
      return;
    }
    try {
      const remoto = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (!remoto.ok) throw new Error(String(remoto.status));
      const tipo = remoto.headers.get('content-type') ?? 'image/png';
      const datos = Buffer.from(await remoto.arrayBuffer());
      res.setHeader('Content-Type', tipo);
      res.setHeader('Cache-Control', 'private, max-age=3600');
      res.send(datos);
    } catch {
      res.status(404).json({ message: 'No se pudo traer el logo' });
    }
  }
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
