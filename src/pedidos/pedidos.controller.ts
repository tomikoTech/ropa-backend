import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PedidosService } from './pedidos.service.js';
import { AceptarPedidoDto, RechazarPedidoDto } from './dto/pedidos.dto.js';
import { TenantId } from '../common/decorators/tenant-id.decorator.js';
import { UserId } from '../common/decorators/user-id.decorator.js';

/** Bajo `store-settings/orders`, con los demás endpoints de pedidos. */
@ApiTags('Pedidos')
@ApiBearerAuth()
@Controller('store-settings/orders')
export class PedidosController {
  constructor(private readonly pedidos: PedidosService) {}

  @Post(':id/aceptar')
  @ApiOperation({
    summary: 'Aceptar el pedido: crea la venta y arma el WhatsApp al cliente',
  })
  aceptar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AceptarPedidoDto,
    @UserId() userId: string,
    @TenantId() tenantId: string,
  ) {
    return this.pedidos.aceptar(id, dto, userId, tenantId);
  }

  @Post(':id/rechazar')
  @ApiOperation({
    summary: 'Rechazar el pedido y armar el WhatsApp al cliente',
  })
  rechazar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RechazarPedidoDto,
    @TenantId() tenantId: string,
  ) {
    return this.pedidos.rechazar(id, dto, tenantId);
  }
}
