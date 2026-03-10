import {
  Controller,
  Get,
  Query,
  Res,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import type { Response } from 'express';
import { ReportsService } from './reports.service.js';
import { TenantId } from '../common/decorators/tenant-id.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Role } from '../common/enums/role.enum.js';
import ExcelJS from 'exceljs';

@ApiTags('Reportes')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Estadísticas del dashboard' })
  getDashboard(@TenantId() tenantId: string) {
    return this.reportsService.getDashboardStats(tenantId);
  }

  @Get('sales')
  @ApiOperation({ summary: 'Reporte de ventas' })
  getSalesReport(
    @TenantId() tenantId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('userId') userId?: string,
  ) {
    if (!from || !to) {
      throw new BadRequestException('Parámetros from y to son requeridos');
    }
    return this.reportsService.getSalesReport({ from, to, warehouseId, userId }, tenantId);
  }

  @Get('top-products')
  @ApiOperation({ summary: 'Productos más vendidos' })
  getTopProducts(
    @TenantId() tenantId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('limit') limit?: string,
  ) {
    if (!from || !to) {
      throw new BadRequestException('Parámetros from y to son requeridos');
    }
    return this.reportsService.getTopProducts({
      from,
      to,
      limit: limit ? parseInt(limit, 10) : undefined,
    }, tenantId);
  }

  @Get('inventory')
  @ApiOperation({ summary: 'Valorización de inventario' })
  getInventoryValuation(
    @TenantId() tenantId: string,
    @Query('warehouseId') warehouseId?: string,
  ) {
    return this.reportsService.getInventoryValuation(warehouseId, tenantId);
  }

  @Get('sales/export')
  @Roles(Role.ADMIN, Role.CONTABILIDAD)
  @ApiOperation({ summary: 'Exportar reporte ventas a Excel' })
  async exportSalesExcel(
    @TenantId() tenantId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('warehouseId') warehouseId: string | undefined,
    @Res() res: Response,
  ) {
    if (!from || !to) {
      throw new BadRequestException('Parámetros from y to son requeridos');
    }

    const report = await this.reportsService.getSalesReport({ from, to, warehouseId }, tenantId);
    const topProducts = await this.reportsService.getTopProducts({ from, to }, tenantId);

    const workbook = new ExcelJS.Workbook();

    // Summary sheet
    const summary = workbook.addWorksheet('Resumen');
    summary.columns = [
      { header: 'Métrica', key: 'metric', width: 30 },
      { header: 'Valor', key: 'value', width: 20 },
    ];
    summary.addRows([
      { metric: 'Total Ventas', value: report.totalSales },
      { metric: 'Monto Total', value: `$${report.totalAmount.toLocaleString('es-CO')}` },
      { metric: 'Total Items', value: report.totalItems },
      { metric: 'IVA Total', value: `$${report.totalTax.toLocaleString('es-CO')}` },
      { metric: 'Descuentos Total', value: `$${report.totalDiscount.toLocaleString('es-CO')}` },
      { metric: 'Ticket Promedio', value: `$${report.averageTicket.toLocaleString('es-CO')}` },
    ]);
    summary.getRow(1).font = { bold: true };

    // Daily breakdown sheet
    const daily = workbook.addWorksheet('Ventas Diarias');
    daily.columns = [
      { header: 'Fecha', key: 'date', width: 15 },
      { header: 'Ventas', key: 'sales', width: 10 },
      { header: 'Monto', key: 'amount', width: 20 },
    ];
    for (const d of report.dailyBreakdown) {
      daily.addRow({ date: d.date, sales: d.sales, amount: d.amount });
    }
    daily.getRow(1).font = { bold: true };

    // Top products sheet
    const top = workbook.addWorksheet('Top Productos');
    top.columns = [
      { header: 'Producto', key: 'product', width: 30 },
      { header: 'SKU', key: 'sku', width: 20 },
      { header: 'Talla', key: 'size', width: 10 },
      { header: 'Color', key: 'color', width: 15 },
      { header: 'Cantidad', key: 'qty', width: 12 },
      { header: 'Ingresos', key: 'revenue', width: 20 },
    ];
    for (const p of topProducts) {
      top.addRow({
        product: p.productName,
        sku: p.variantSku,
        size: p.size,
        color: p.color,
        qty: p.totalQuantity,
        revenue: p.totalRevenue,
      });
    }
    top.getRow(1).font = { bold: true };

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=reporte-ventas-${from}-${to}.xlsx`,
    );

    await workbook.xlsx.write(res);
    res.end();
  }
}
