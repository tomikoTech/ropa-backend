import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Res,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import type { Response } from 'express';
import { PosService } from './pos.service.js';
import { ScanService } from './services/scan.service.js';
import { buildStatementWorkbook } from '../common/utils/statement-excel.util.js';
import { CreateSaleDto } from './dto/create-sale.dto.js';
import { UpdateSaleDto } from './dto/update-sale.dto.js';
import { MarkSalePaidDto } from './dto/mark-sale-paid.dto.js';
import { RecordArPaymentDto } from './dto/record-ar-payment.dto.js';
import { SendInvoiceDto } from './dto/send-invoice.dto.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { TenantId } from '../common/decorators/tenant-id.decorator.js';
import { SaleStatus } from '../common/enums/sale-status.enum.js';

@ApiTags('pos')
@ApiBearerAuth()
@Controller('pos')
export class PosController {
  constructor(
    private readonly posService: PosService,
    private readonly scanService: ScanService,
  ) {}

  @Get('scan/:barcode')
  @ApiOperation({
    summary:
      'Resuelve un código escaneado: bulto etiquetado (caja/par) o variante',
  })
  scan(@Param('barcode') barcode: string, @TenantId() tenantId: string) {
    return this.scanService.resolve(barcode, tenantId);
  }

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
    @Query('saleChannel') saleChannel?: string,
    @Query('paid') paid?: string,
    @Query('clientPhone') clientPhone?: string,
  ) {
    return this.posService.findAll(
      {
        status,
        warehouseId,
        userId,
        from,
        to,
        limit: limit ? parseInt(limit, 10) : undefined,
        saleChannel,
        paid: paid === undefined ? undefined : paid === 'true',
        clientPhone,
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

  @Get('clients/:clientId/statement')
  @ApiOperation({ summary: 'Estado de cuenta del cliente' })
  getClientStatement(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @TenantId() tenantId: string,
  ) {
    return this.posService.getClientStatement(clientId, tenantId);
  }

  @Get('clients/:clientId/statement/export')
  @ApiOperation({ summary: 'Exportar estado de cuenta del cliente (Excel)' })
  async exportClientStatement(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @TenantId() tenantId: string,
    @Res() res: Response,
    @Query('format') format?: string,
  ) {
    const st = await this.posService.getClientStatement(clientId, tenantId);
    const name = st.client?.name || 'cliente';
    const wb = buildStatementWorkbook({
      kind: 'client',
      header: st.client
        ? {
            name: st.client.name,
            doc: st.client.documentNumber,
            phone: st.client.phone,
            email: st.client.email,
            address: st.client.address,
          }
        : { name },
      baseLabel: 'Total facturado (crédito)',
      totals: {
        totalBase: st.totals.totalCredit,
        totalPaid: st.totals.totalPaid,
        totalDebt: st.totals.totalDebt,
      },
      invoices: st.invoices.map((i) => ({
        number: i.invoiceNumber,
        date: i.date,
        dueDate: i.dueDate,
        status: i.paymentStatus,
        total: i.total,
        paid: i.paidAmount,
        balance: i.balance,
        items: i.items.map((it) => ({
          name: it.name,
          size: it.size,
          color: it.color,
          quantity: it.quantity,
          unit: it.unitPrice,
          lineTotal: it.lineTotal,
        })),
      })),
    });

    const safe = name.replace(/[^a-zA-Z0-9]/g, '_');
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=estado-cuenta-${safe}.csv`,
      );
      res.write('﻿');
      await wb.csv.write(res);
      res.end();
      return;
    }
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=estado-cuenta-${safe}.xlsx`,
    );
    await wb.xlsx.write(res);
    res.end();
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

  @Patch('sales/:id')
  updateSale(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSaleDto,
    @CurrentUser() user: { id: string },
    @TenantId() tenantId: string,
  ) {
    return this.posService.updateSale(id, dto, user.id, tenantId);
  }

  @Post('sales/:id/mark-paid')
  markSalePaid(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MarkSalePaidDto,
    @TenantId() tenantId: string,
  ) {
    return this.posService.markSalePaid(id, dto, tenantId);
  }
}
