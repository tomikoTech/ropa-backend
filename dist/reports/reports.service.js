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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReportsService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const sale_entity_js_1 = require("../pos/entities/sale.entity.js");
const sale_item_entity_js_1 = require("../pos/entities/sale-item.entity.js");
const stock_entity_js_1 = require("../inventory/entities/stock.entity.js");
const sale_status_enum_js_1 = require("../common/enums/sale-status.enum.js");
let ReportsService = class ReportsService {
    saleRepository;
    saleItemRepository;
    stockRepository;
    constructor(saleRepository, saleItemRepository, stockRepository) {
        this.saleRepository = saleRepository;
        this.saleItemRepository = saleItemRepository;
        this.stockRepository = stockRepository;
    }
    async getSalesReport(filters, tenantId) {
        const qb = this.saleRepository
            .createQueryBuilder('s')
            .leftJoinAndSelect('s.items', 'items')
            .leftJoinAndSelect('s.payments', 'payments')
            .leftJoinAndSelect('s.accountsReceivable', 'ar')
            .where('s.status = :status', { status: sale_status_enum_js_1.SaleStatus.COMPLETED })
            .andWhere('s.created_at >= :from', { from: filters.from })
            .andWhere('s.created_at <= :to', { to: filters.to })
            .andWhere('s.tenant_id = :tenantId', { tenantId });
        if (filters.warehouseId) {
            qb.andWhere('s.warehouse_id = :wid', { wid: filters.warehouseId });
        }
        if (filters.userId) {
            qb.andWhere('s.user_id = :uid', { uid: filters.userId });
        }
        const sales = await qb.getMany();
        const totalSales = sales.length;
        const totalAmount = sales.reduce((s, sale) => s + Number(sale.total), 0);
        const totalTax = sales.reduce((s, sale) => s + Number(sale.taxAmount), 0);
        const totalDiscount = sales.reduce((s, sale) => s + Number(sale.discountAmount), 0);
        const totalItems = sales.reduce((s, sale) => s + sale.items.reduce((is, i) => is + i.quantity, 0), 0);
        const averageTicket = totalSales > 0 ? totalAmount / totalSales : 0;
        const byPaymentMethod = {};
        for (const sale of sales) {
            for (const p of sale.payments) {
                byPaymentMethod[p.method] =
                    (byPaymentMethod[p.method] || 0) + Number(p.amount);
            }
            if (sale.accountsReceivable) {
                for (const ar of sale.accountsReceivable) {
                    byPaymentMethod['CREDITO'] =
                        (byPaymentMethod['CREDITO'] || 0) + Number(ar.totalAmount);
                }
            }
        }
        const dailyMap = new Map();
        for (const sale of sales) {
            const date = new Date(sale.createdAt).toISOString().split('T')[0];
            const existing = dailyMap.get(date) || { sales: 0, amount: 0 };
            existing.sales += 1;
            existing.amount += Number(sale.total);
            dailyMap.set(date, existing);
        }
        const dailyBreakdown = Array.from(dailyMap.entries())
            .map(([date, data]) => ({ date, ...data }))
            .sort((a, b) => a.date.localeCompare(b.date));
        return {
            totalSales,
            totalAmount,
            totalItems,
            totalTax,
            totalDiscount,
            averageTicket,
            byPaymentMethod,
            dailyBreakdown,
        };
    }
    async getTopProducts(filters, tenantId) {
        const result = await this.saleItemRepository
            .createQueryBuilder('si')
            .innerJoin('si.sale', 's')
            .select('si.product_name', 'productName')
            .addSelect('si.variant_sku', 'variantSku')
            .addSelect('si.variant_size', 'size')
            .addSelect('si.variant_color', 'color')
            .addSelect('SUM(si.quantity)', 'totalQuantity')
            .addSelect('SUM(si.line_total)', 'totalRevenue')
            .where('s.status = :status', { status: sale_status_enum_js_1.SaleStatus.COMPLETED })
            .andWhere('s.created_at >= :from', { from: filters.from })
            .andWhere('s.created_at <= :to', { to: filters.to })
            .andWhere('s.tenant_id = :tenantId', { tenantId })
            .groupBy('si.product_name')
            .addGroupBy('si.variant_sku')
            .addGroupBy('si.variant_size')
            .addGroupBy('si.variant_color')
            .orderBy('"totalQuantity"', 'DESC')
            .limit(filters.limit || 20)
            .getRawMany();
        return result.map((r) => ({
            productName: r.productName,
            variantSku: r.variantSku,
            size: r.size,
            color: r.color,
            totalQuantity: Number(r.totalQuantity),
            totalRevenue: Number(r.totalRevenue),
        }));
    }
    async getInventoryValuation(warehouseId, tenantId) {
        const qb = this.stockRepository
            .createQueryBuilder('st')
            .leftJoinAndSelect('st.variant', 'v')
            .leftJoinAndSelect('v.product', 'p')
            .leftJoinAndSelect('st.warehouse', 'w')
            .where('st.quantity > 0')
            .andWhere('st.tenant_id = :tenantId', { tenantId });
        if (warehouseId) {
            qb.andWhere('st.warehouse_id = :wid', { wid: warehouseId });
        }
        const stocks = await qb.getMany();
        let totalItems = 0;
        let totalCostValue = 0;
        let totalRetailValue = 0;
        let lowStockCount = 0;
        const items = stocks.map((s) => {
            const costPrice = Number(s.variant.product.costPrice);
            const retailPrice = s.variant.priceOverride
                ? Number(s.variant.priceOverride)
                : Number(s.variant.product.basePrice);
            const costValue = s.quantity * costPrice;
            const retailValue = s.quantity * retailPrice;
            totalItems += s.quantity;
            totalCostValue += costValue;
            totalRetailValue += retailValue;
            if (s.quantity <= s.minStock)
                lowStockCount++;
            return {
                sku: s.variant.sku,
                productName: s.variant.product.name,
                size: s.variant.size,
                color: s.variant.color,
                warehouse: s.warehouse.name,
                quantity: s.quantity,
                costPrice,
                retailPrice,
                costValue,
                retailValue,
            };
        });
        return {
            totalItems,
            totalCostValue,
            totalRetailValue,
            lowStockCount,
            items,
        };
    }
    async getDashboardStats(tenantId) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        const todayResult = await this.saleRepository
            .createQueryBuilder('s')
            .select('COUNT(*)', 'count')
            .addSelect('COALESCE(SUM(s.total), 0)', 'revenue')
            .where('s.status = :status', { status: sale_status_enum_js_1.SaleStatus.COMPLETED })
            .andWhere('s.created_at >= :today', { today: today.toISOString() })
            .andWhere('s.tenant_id = :tenantId', { tenantId })
            .getRawOne();
        const monthResult = await this.saleRepository
            .createQueryBuilder('s')
            .select('COUNT(*)', 'count')
            .addSelect('COALESCE(SUM(s.total), 0)', 'revenue')
            .where('s.status = :status', { status: sale_status_enum_js_1.SaleStatus.COMPLETED })
            .andWhere('s.created_at >= :monthStart', {
            monthStart: monthStart.toISOString(),
        })
            .andWhere('s.tenant_id = :tenantId', { tenantId })
            .getRawOne();
        const lowStockCount = await this.stockRepository
            .createQueryBuilder('st')
            .where('st.quantity <= st.min_stock')
            .andWhere('st.quantity > 0')
            .andWhere('st.tenant_id = :tenantId', { tenantId })
            .getCount();
        const totalProducts = await this.stockRepository
            .createQueryBuilder('st')
            .select('SUM(st.quantity)', 'total')
            .where('st.tenant_id = :tenantId', { tenantId })
            .getRawOne();
        return {
            todaySales: Number(todayResult?.count || 0),
            todayRevenue: Number(todayResult?.revenue || 0),
            monthSales: Number(monthResult?.count || 0),
            monthRevenue: Number(monthResult?.revenue || 0),
            totalProducts: Number(totalProducts?.total || 0),
            lowStockAlerts: lowStockCount,
        };
    }
};
exports.ReportsService = ReportsService;
exports.ReportsService = ReportsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(sale_entity_js_1.Sale)),
    __param(1, (0, typeorm_1.InjectRepository)(sale_item_entity_js_1.SaleItem)),
    __param(2, (0, typeorm_1.InjectRepository)(stock_entity_js_1.Stock)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository])
], ReportsService);
//# sourceMappingURL=reports.service.js.map