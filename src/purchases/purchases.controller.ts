import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PurchasesService } from './purchases.service.js';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto.js';
import { ReceiveItemsDto } from './dto/receive-items.dto.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { TenantId } from '../common/decorators/tenant-id.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Role } from '../common/enums/role.enum.js';
import { PurchaseOrderStatus } from '../common/enums/purchase-order-status.enum.js';

@ApiTags('Compras')
@ApiBearerAuth()
@Controller('purchases')
export class PurchasesController {
  constructor(private readonly purchasesService: PurchasesService) {}

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Crear orden de compra' })
  create(
    @Body() dto: CreatePurchaseOrderDto,
    @CurrentUser() user: { id: string },
    @TenantId() tenantId: string,
  ) {
    return this.purchasesService.create(dto, user.id, tenantId);
  }

  @Get()
  @ApiOperation({ summary: 'Listar órdenes de compra' })
  findAll(
    @TenantId() tenantId: string,
    @Query('status') status?: PurchaseOrderStatus,
    @Query('supplierId') supplierId?: string,
  ) {
    return this.purchasesService.findAll({ status, supplierId }, tenantId);
  }

  @Get('accounts-payable')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Listar cuentas por pagar' })
  findAllAccountsPayable(
    @TenantId() tenantId: string,
    @Query('isPaid') isPaid?: string,
  ) {
    const filters =
      isPaid !== undefined ? { isPaid: isPaid === 'true' } : undefined;
    return this.purchasesService.findAllAccountsPayable(filters, tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener orden de compra por ID' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantId() tenantId: string,
  ) {
    return this.purchasesService.findOne(id, tenantId);
  }

  @Post(':id/send')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Enviar orden de compra al proveedor' })
  send(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantId() tenantId: string,
  ) {
    return this.purchasesService.send(id, tenantId);
  }

  @Post(':id/receive')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Recibir items de orden de compra' })
  receive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReceiveItemsDto,
    @CurrentUser() user: { id: string },
    @TenantId() tenantId: string,
  ) {
    return this.purchasesService.receiveItems(id, dto, user.id, tenantId);
  }

  @Post(':id/cancel')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Cancelar orden de compra' })
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantId() tenantId: string,
  ) {
    return this.purchasesService.cancel(id, tenantId);
  }

  @Post('accounts-payable/:id/pay')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Marcar cuenta como pagada' })
  markAsPaid(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { receiptImageUrl?: string },
    @TenantId() tenantId: string,
  ) {
    return this.purchasesService.markAsPaid(id, body?.receiptImageUrl, tenantId);
  }
}
