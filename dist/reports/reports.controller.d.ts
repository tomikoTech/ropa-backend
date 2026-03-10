import type { Response } from 'express';
import { ReportsService } from './reports.service.js';
export declare class ReportsController {
    private readonly reportsService;
    constructor(reportsService: ReportsService);
    getDashboard(tenantId: string): Promise<{
        todaySales: number;
        todayRevenue: number;
        monthSales: number;
        monthRevenue: number;
        totalProducts: number;
        lowStockAlerts: number;
    }>;
    getSalesReport(tenantId: string, from: string, to: string, warehouseId?: string, userId?: string): Promise<import("./reports.service.js").SalesReport>;
    getTopProducts(tenantId: string, from: string, to: string, limit?: string): Promise<import("./reports.service.js").TopProduct[]>;
    getInventoryValuation(tenantId: string, warehouseId?: string): Promise<import("./reports.service.js").InventoryValuation>;
    exportSalesExcel(tenantId: string, from: string, to: string, warehouseId: string | undefined, res: Response): Promise<void>;
}
