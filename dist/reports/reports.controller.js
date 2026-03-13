"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReportsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const reports_service_js_1 = require("./reports.service.js");
const tenant_id_decorator_js_1 = require("../common/decorators/tenant-id.decorator.js");
const roles_decorator_js_1 = require("../common/decorators/roles.decorator.js");
const role_enum_js_1 = require("../common/enums/role.enum.js");
const exceljs_1 = __importDefault(require("exceljs"));
let ReportsController = class ReportsController {
    reportsService;
    constructor(reportsService) {
        this.reportsService = reportsService;
    }
    getDashboard(tenantId) {
        return this.reportsService.getDashboardStats(tenantId);
    }
    getSalesReport(tenantId, from, to, warehouseId, userId) {
        if (!from || !to) {
            throw new common_1.BadRequestException('Parámetros from y to son requeridos');
        }
        return this.reportsService.getSalesReport({ from, to, warehouseId, userId }, tenantId);
    }
    getTopProducts(tenantId, from, to, limit) {
        if (!from || !to) {
            throw new common_1.BadRequestException('Parámetros from y to son requeridos');
        }
        return this.reportsService.getTopProducts({
            from,
            to,
            limit: limit ? parseInt(limit, 10) : undefined,
        }, tenantId);
    }
    getInventoryValuation(tenantId, warehouseId) {
        return this.reportsService.getInventoryValuation(warehouseId, tenantId);
    }
    async exportSalesExcel(tenantId, from, to, warehouseId, res) {
        if (!from || !to) {
            throw new common_1.BadRequestException('Parámetros from y to son requeridos');
        }
        const report = await this.reportsService.getSalesReport({ from, to, warehouseId }, tenantId);
        const topProducts = await this.reportsService.getTopProducts({ from, to }, tenantId);
        const workbook = new exceljs_1.default.Workbook();
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
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=reporte-ventas-${from}-${to}.xlsx`);
        await workbook.xlsx.write(res);
        res.end();
    }
};
exports.ReportsController = ReportsController;
__decorate([
    (0, common_1.Get)('dashboard'),
    (0, swagger_1.ApiOperation)({ summary: 'Estadísticas del dashboard' }),
    __param(0, (0, tenant_id_decorator_js_1.TenantId)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "getDashboard", null);
__decorate([
    (0, common_1.Get)('sales'),
    (0, swagger_1.ApiOperation)({ summary: 'Reporte de ventas' }),
    __param(0, (0, tenant_id_decorator_js_1.TenantId)()),
    __param(1, (0, common_1.Query)('from')),
    __param(2, (0, common_1.Query)('to')),
    __param(3, (0, common_1.Query)('warehouseId')),
    __param(4, (0, common_1.Query)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, String]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "getSalesReport", null);
__decorate([
    (0, common_1.Get)('top-products'),
    (0, swagger_1.ApiOperation)({ summary: 'Productos más vendidos' }),
    __param(0, (0, tenant_id_decorator_js_1.TenantId)()),
    __param(1, (0, common_1.Query)('from')),
    __param(2, (0, common_1.Query)('to')),
    __param(3, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "getTopProducts", null);
__decorate([
    (0, common_1.Get)('inventory'),
    (0, swagger_1.ApiOperation)({ summary: 'Valorización de inventario' }),
    __param(0, (0, tenant_id_decorator_js_1.TenantId)()),
    __param(1, (0, common_1.Query)('warehouseId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "getInventoryValuation", null);
__decorate([
    (0, common_1.Get)('sales/export'),
    (0, roles_decorator_js_1.Roles)(role_enum_js_1.Role.ADMIN),
    (0, swagger_1.ApiOperation)({ summary: 'Exportar reporte ventas a Excel' }),
    __param(0, (0, tenant_id_decorator_js_1.TenantId)()),
    __param(1, (0, common_1.Query)('from')),
    __param(2, (0, common_1.Query)('to')),
    __param(3, (0, common_1.Query)('warehouseId')),
    __param(4, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, Object, Object]),
    __metadata("design:returntype", Promise)
], ReportsController.prototype, "exportSalesExcel", null);
exports.ReportsController = ReportsController = __decorate([
    (0, swagger_1.ApiTags)('Reportes'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('reports'),
    __metadata("design:paramtypes", [reports_service_js_1.ReportsService])
], ReportsController);
//# sourceMappingURL=reports.controller.js.map