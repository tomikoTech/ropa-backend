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
import { PurchasesService } from './purchases.service.js';
import { buildStatementWorkbook } from '../common/utils/statement-excel.util.js';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto.js';
import { UpdatePurchaseOrderDto } from './dto/update-purchase-order.dto.js';
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

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary:
      'Editar orden de compra (revierte y re-aplica inventario si ya fue recibida)',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePurchaseOrderDto,
    @CurrentUser() user: { id: string },
    @TenantId() tenantId: string,
  ) {
    return this.purchasesService.update(id, dto, user.id, tenantId);
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

  @Get('suppliers/:supplierId/statement')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Estado de cuenta del proveedor' })
  getSupplierStatement(
    @Param('supplierId', ParseUUIDPipe) supplierId: string,
    @TenantId() tenantId: string,
  ) {
    return this.purchasesService.getSupplierStatement(supplierId, tenantId);
  }

  @Get('suppliers/:supplierId/statement/export')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Exportar estado de cuenta del proveedor (Excel)' })
  async exportSupplierStatement(
    @Param('supplierId', ParseUUIDPipe) supplierId: string,
    @TenantId() tenantId: string,
    @Res() res: Response,
    @Query('format') format?: string,
  ) {
    const st = await this.purchasesService.getSupplierStatement(
      supplierId,
      tenantId,
    );
    const wb = buildStatementWorkbook({
      kind: 'supplier',
      header: {
        name: st.supplier.name,
        doc: st.supplier.nit,
        phone: st.supplier.phone,
        email: st.supplier.email,
        address: st.supplier.address,
      },
      baseLabel: 'Total comprado',
      totals: {
        totalBase: st.totals.totalPurchased,
        totalPaid: st.totals.totalPaid,
        totalDebt: st.totals.totalDebt,
      },
      invoices: st.invoices.map((i) => ({
        number: i.supplierInvoiceNumber || i.orderNumber,
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
          unit: it.unitCost,
          lineTotal: it.lineTotal,
        })),
      })),
    });

    const safe = st.supplier.name.replace(/[^a-zA-Z0-9]/g, '_');
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
  send(@Param('id', ParseUUIDPipe) id: string, @TenantId() tenantId: string) {
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
  cancel(@Param('id', ParseUUIDPipe) id: string, @TenantId() tenantId: string) {
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
    return this.purchasesService.markAsPaid(
      id,
      body?.receiptImageUrl,
      tenantId,
    );
  }

  @Post('accounts-payable/:id/payment')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Registrar abono a cuenta por pagar' })
  addApPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body()
    body: {
      amount: number;
      method: string;
      reference?: string;
      receiptImageUrl?: string;
      notes?: string;
    },
    @TenantId() tenantId: string,
  ) {
    return this.purchasesService.addApPayment(id, body, tenantId);
  }
}
