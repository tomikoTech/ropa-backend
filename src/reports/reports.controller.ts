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
    return this.reportsService.getSalesReport(
      { from, to, warehouseId, userId },
      tenantId,
    );
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
    return this.reportsService.getTopProducts(
      {
        from,
        to,
        limit: limit ? parseInt(limit, 10) : undefined,
      },
      tenantId,
    );
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
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Exportar reporte ventas a Excel' })
  async exportSalesExcel(
    @TenantId() tenantId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('warehouseId') warehouseId: string | undefined,
    @Res() res: Response,
    @Query('format') format?: string,
  ) {
    if (!from || !to) {
      throw new BadRequestException('Parámetros from y to son requeridos');
    }

    const report = await this.reportsService.getSalesReport(
      { from, to, warehouseId },
      tenantId,
    );
    const topProducts = await this.reportsService.getTopProducts(
      { from, to },
      tenantId,
    );

    const workbook = new ExcelJS.Workbook();

    // Summary sheet
    const summary = workbook.addWorksheet('Resumen');
    summary.columns = [
      { header: 'Métrica', key: 'metric', width: 30 },
      { header: 'Valor', key: 'value', width: 20 },
    ];
    summary.addRows([
      { metric: 'Total Ventas', value: report.totalSales },
      {
        metric: 'Monto Total',
        value: `$${report.totalAmount.toLocaleString('es-CO')}`,
      },
      { metric: 'Total Items', value: report.totalItems },
      {
        metric: 'IVA Total',
        value: `$${report.totalTax.toLocaleString('es-CO')}`,
      },
      {
        metric: 'Descuentos Total',
        value: `$${report.totalDiscount.toLocaleString('es-CO')}`,
      },
      {
        metric: 'Ticket Promedio',
        value: `$${report.averageTicket.toLocaleString('es-CO')}`,
      },
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

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=reporte-ventas-${from}-${to}.csv`,
      );
      res.write('\uFEFF');
      // For CSV, create a single-sheet workbook with daily breakdown + summary
      const csvWorkbook = new ExcelJS.Workbook();
      const csvSheet = csvWorkbook.addWorksheet('Ventas');
      csvSheet.columns = [
        { header: 'Fecha', key: 'date', width: 15 },
        { header: 'Ventas', key: 'sales', width: 10 },
        { header: 'Monto', key: 'amount', width: 20 },
      ];
      for (const d of report.dailyBreakdown) {
        csvSheet.addRow({ date: d.date, sales: d.sales, amount: d.amount });
      }
      csvSheet.addRow({});
      csvSheet.addRow({ date: 'RESUMEN', sales: '', amount: '' });
      csvSheet.addRow({ date: 'Total Ventas', sales: report.totalSales, amount: '' });
      csvSheet.addRow({ date: 'Monto Total', sales: '', amount: report.totalAmount });
      csvSheet.addRow({ date: 'Ticket Promedio', sales: '', amount: report.averageTicket });
      await csvWorkbook.csv.write(res);
      res.end();
      return;
    }

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

  @Get('inventory/export')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Exportar inventario a Excel/CSV' })
  async exportInventory(
    @TenantId() tenantId: string,
    @Query('warehouseId') warehouseId: string | undefined,
    @Res() res: Response,
    @Query('format') format?: string,
  ) {
    const inventory = await this.reportsService.getInventoryValuation(warehouseId, tenantId);

    const workbook = new ExcelJS.Workbook();

    // Summary sheet
    const summary = workbook.addWorksheet('Resumen');
    summary.columns = [
      { header: 'Métrica', key: 'metric', width: 30 },
      { header: 'Valor', key: 'value', width: 25 },
    ];
    summary.addRows([
      { metric: 'Total Items', value: inventory.totalItems },
      { metric: 'Valor Costo Total', value: inventory.totalCostValue },
      { metric: 'Valor Retail Total', value: inventory.totalRetailValue },
      { metric: 'Items Stock Bajo', value: inventory.lowStockCount },
    ]);
    summary.getRow(1).font = { bold: true };

    // Items detail sheet
    const items = workbook.addWorksheet('Inventario Detallado');
    items.columns = [
      { header: 'SKU', key: 'sku', width: 20 },
      { header: 'Producto', key: 'productName', width: 30 },
      { header: 'Talla', key: 'size', width: 10 },
      { header: 'Color', key: 'color', width: 15 },
      { header: 'Bodega', key: 'warehouse', width: 20 },
      { header: 'Cantidad', key: 'quantity', width: 12 },
      { header: 'Precio Costo', key: 'costPrice', width: 15 },
      { header: 'Precio Retail', key: 'retailPrice', width: 15 },
      { header: 'Valor Costo', key: 'costValue', width: 15 },
      { header: 'Valor Retail', key: 'retailValue', width: 15 },
    ];
    for (const item of inventory.items) {
      items.addRow(item);
    }
    items.getRow(1).font = { bold: true };

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename=inventario.csv');
      res.write('\uFEFF');
      // For CSV, create a single-sheet workbook with items data
      const csvWorkbook = new ExcelJS.Workbook();
      const csvSheet = csvWorkbook.addWorksheet('Inventario');
      csvSheet.columns = items.columns;
      for (const item of inventory.items) {
        csvSheet.addRow(item);
      }
      await csvWorkbook.csv.write(res);
      res.end();
      return;
    }

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=inventario.xlsx',
    );

    await workbook.xlsx.write(res);
    res.end();
  }
}
