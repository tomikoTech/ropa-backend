import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Sale } from '../pos/entities/sale.entity.js';
import { SaleItem } from '../pos/entities/sale-item.entity.js';
import { Stock } from '../inventory/entities/stock.entity.js';
import { SaleStatus } from '../common/enums/sale-status.enum.js';

export interface SalesReport {
  totalSales: number;
  totalAmount: number;
  totalItems: number;
  totalTax: number;
  totalDiscount: number;
  averageTicket: number;
  byPaymentMethod: Record<string, number>;
  dailyBreakdown: { date: string; sales: number; amount: number }[];
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

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Sale)
    private readonly saleRepository: Repository<Sale>,
    @InjectRepository(SaleItem)
    private readonly saleItemRepository: Repository<SaleItem>,
    @InjectRepository(Stock)
    private readonly stockRepository: Repository<Stock>,
  ) {}

  async getSalesReport(filters: {
    from: string;
    to: string;
    warehouseId?: string;
    userId?: string;
  }, tenantId: string): Promise<SalesReport> {
    const qb = this.saleRepository
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.items', 'items')
      .leftJoinAndSelect('s.payments', 'payments')
      .leftJoinAndSelect('s.accountsReceivable', 'ar')
      .where('s.status = :status', { status: SaleStatus.COMPLETED })
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
    const totalItems = sales.reduce(
      (s, sale) => s + sale.items.reduce((is, i) => is + i.quantity, 0),
      0,
    );
    const averageTicket = totalSales > 0 ? totalAmount / totalSales : 0;

    const byPaymentMethod: Record<string, number> = {};
    for (const sale of sales) {
      for (const p of sale.payments) {
        byPaymentMethod[p.method] = (byPaymentMethod[p.method] || 0) + Number(p.amount);
      }
      // Credit sales: accountsReceivable records
      if (sale.accountsReceivable) {
        for (const ar of sale.accountsReceivable) {
          byPaymentMethod['CREDITO'] = (byPaymentMethod['CREDITO'] || 0) + Number(ar.totalAmount);
        }
      }
    }

    // Daily breakdown
    const dailyMap = new Map<string, { sales: number; amount: number }>();
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

  async getTopProducts(filters: {
    from: string;
    to: string;
    limit?: number;
  }, tenantId: string): Promise<TopProduct[]> {
    const result = await this.saleItemRepository
      .createQueryBuilder('si')
      .innerJoin('si.sale', 's')
      .select('si.product_name', 'productName')
      .addSelect('si.variant_sku', 'variantSku')
      .addSelect('si.variant_size', 'size')
      .addSelect('si.variant_color', 'color')
      .addSelect('SUM(si.quantity)', 'totalQuantity')
      .addSelect('SUM(si.line_total)', 'totalRevenue')
      .where('s.status = :status', { status: SaleStatus.COMPLETED })
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

  async getInventoryValuation(warehouseId: string | undefined, tenantId: string): Promise<InventoryValuation> {
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
      if (s.quantity <= s.minStock) lowStockCount++;

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

    return { totalItems, totalCostValue, totalRetailValue, lowStockCount, items };
  }

  async getDashboardStats(tenantId: string): Promise<{
    todaySales: number;
    todayRevenue: number;
    monthSales: number;
    monthRevenue: number;
    totalProducts: number;
    lowStockAlerts: number;
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    const todayResult = await this.saleRepository
      .createQueryBuilder('s')
      .select('COUNT(*)', 'count')
      .addSelect('COALESCE(SUM(s.total), 0)', 'revenue')
      .where('s.status = :status', { status: SaleStatus.COMPLETED })
      .andWhere('s.created_at >= :today', { today: today.toISOString() })
      .andWhere('s.tenant_id = :tenantId', { tenantId })
      .getRawOne();

    const monthResult = await this.saleRepository
      .createQueryBuilder('s')
      .select('COUNT(*)', 'count')
      .addSelect('COALESCE(SUM(s.total), 0)', 'revenue')
      .where('s.status = :status', { status: SaleStatus.COMPLETED })
      .andWhere('s.created_at >= :monthStart', { monthStart: monthStart.toISOString() })
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
}
