import { Repository } from 'typeorm';
import { Sale } from '../pos/entities/sale.entity.js';
import { SaleItem } from '../pos/entities/sale-item.entity.js';
import { Stock } from '../inventory/entities/stock.entity.js';
export interface SalesReport {
    totalSales: number;
    totalAmount: number;
    totalItems: number;
    totalTax: number;
    totalDiscount: number;
    averageTicket: number;
    byPaymentMethod: Record<string, number>;
    dailyBreakdown: {
        date: string;
        sales: number;
        amount: number;
    }[];
}
export interface TopProduct {
    productName: string;
    variantSku: string;
    size: string;
    color: string;
    totalQuantity: number;
    totalRevenue: number;
}
export interface InventoryValuation {
    totalItems: number;
    totalCostValue: number;
    totalRetailValue: number;
    lowStockCount: number;
    items: {
        sku: string;
        productName: string;
        size: string;
        color: string;
        warehouse: string;
        quantity: number;
        costPrice: number;
        retailPrice: number;
        costValue: number;
        retailValue: number;
    }[];
}
export declare class ReportsService {
    private readonly saleRepository;
    private readonly saleItemRepository;
    private readonly stockRepository;
    constructor(saleRepository: Repository<Sale>, saleItemRepository: Repository<SaleItem>, stockRepository: Repository<Stock>);
    getSalesReport(filters: {
        from: string;
        to: string;
        warehouseId?: string;
        userId?: string;
    }, tenantId: string): Promise<SalesReport>;
    getTopProducts(filters: {
        from: string;
        to: string;
        limit?: number;
    }, tenantId: string): Promise<TopProduct[]>;
    getInventoryValuation(warehouseId: string | undefined, tenantId: string): Promise<InventoryValuation>;
    getDashboardStats(tenantId: string): Promise<{
        todaySales: number;
        todayRevenue: number;
        monthSales: number;
        monthRevenue: number;
        totalProducts: number;
        lowStockAlerts: number;
    }>;
}
