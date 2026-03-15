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
import { PosService } from './pos.service.js';
import { CreateSaleDto } from './dto/create-sale.dto.js';
import { RecordArPaymentDto } from './dto/record-ar-payment.dto.js';
import { SendInvoiceDto } from './dto/send-invoice.dto.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { TenantId } from '../common/decorators/tenant-id.decorator.js';
import { SaleStatus } from '../common/enums/sale-status.enum.js';

@ApiTags('pos')
@ApiBearerAuth()
@Controller('pos')
export class PosController {
  constructor(private readonly posService: PosService) {}

  @Post('sales')
  createSale(
    @Body() dto: CreateSaleDto,
    @CurrentUser() user: { id: string },
    @TenantId() tenantId: string,
  ) {
    return this.posService.createSale(dto, user.id, tenantId);
  }

  @Get('sales')
  findAll(
    @TenantId() tenantId: string,
    @Query('status') status?: SaleStatus,
    @Query('warehouseId') warehouseId?: string,
    @Query('userId') userId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    return this.posService.findAll(
      {
        status,
        warehouseId,
        userId,
        from,
        to,
        limit: limit ? parseInt(limit, 10) : undefined,
      },
      tenantId,
    );
  }

  @Get('sales/daily-summary')
  getDailySummary(
    @TenantId() tenantId: string,
    @Query('warehouseId') warehouseId?: string,
  ) {
    return this.posService.getDailySummary(warehouseId, tenantId);
  }

  // ─── Accounts Receivable ───

  @Get('accounts-receivable')
  @ApiOperation({ summary: 'Listar cuentas por cobrar' })
  findAllAccountsReceivable(
    @TenantId() tenantId: string,
    @Query('isFullyPaid') isFullyPaid?: string,
    @Query('clientId') clientId?: string,
  ) {
    const filters: { isFullyPaid?: boolean; clientId?: string } = {};
    if (isFullyPaid !== undefined) filters.isFullyPaid = isFullyPaid === 'true';
    if (clientId) filters.clientId = clientId;
    return this.posService.findAllAccountsReceivable(filters, tenantId);
  }

  @Get('accounts-receivable/:id')
  @ApiOperation({ summary: 'Detalle de cuenta por cobrar' })
  findOneAccountReceivable(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantId() tenantId: string,
  ) {
    return this.posService.findOneAccountReceivable(id, tenantId);
  }

  @Post('accounts-receivable/:id/payment')
  @ApiOperation({ summary: 'Registrar abono a cuenta por cobrar' })
  recordArPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordArPaymentDto,
    @TenantId() tenantId: string,
  ) {
    return this.posService.recordArPayment(id, dto, tenantId);
  }

  @Get('clients/:clientId/account-summary')
  @ApiOperation({ summary: 'Resumen de cuenta del cliente' })
  getClientAccountSummary(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @TenantId() tenantId: string,
  ) {
    return this.posService.getClientAccountSummary(clientId, tenantId);
  }

  @Get('sales/:id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantId() tenantId: string,
  ) {
    return this.posService.findOne(id, tenantId);
  }

  @Get('sales/:id/receipt')
  getReceipt(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantId() tenantId: string,
  ) {
    return this.posService.getReceipt(id, tenantId);
  }

  @Post('sales/:id/send-invoice')
  @ApiOperation({ summary: 'Enviar factura por email' })
  sendInvoice(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendInvoiceDto,
    @TenantId() tenantId: string,
  ) {
    return this.posService.sendSaleInvoice(id, dto.email, tenantId);
  }

  @Post('sales/:id/cancel')
  cancelSale(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string },
    @TenantId() tenantId: string,
  ) {
    return this.posService.cancelSale(id, user.id, tenantId);
  }
}
