import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Sale } from '../pos/entities/sale.entity.js';
import { SaleItem } from '../pos/entities/sale-item.entity.js';
import { Payment } from '../pos/entities/payment.entity.js';
import { AccountsReceivable } from '../pos/entities/accounts-receivable.entity.js';
import { AccountsReceivablePayment } from '../pos/entities/accounts-receivable-payment.entity.js';
import { AccountsPayable } from '../purchases/entities/accounts-payable.entity.js';
import { AccountsPayablePayment } from '../purchases/entities/accounts-payable-payment.entity.js';
import { Stock } from '../inventory/entities/stock.entity.js';
import { StockUnit } from '../inventory/entities/stock-unit.entity.js';
import { StockMovement } from '../inventory/entities/stock-movement.entity.js';
import { StockTransfer } from '../inventory/entities/stock-transfer.entity.js';
import { InventoryCount } from '../inventory/entities/inventory-count.entity.js';
import { InventoryCountLine } from '../inventory/entities/inventory-count-line.entity.js';
import { Warehouse } from '../inventory/entities/warehouse.entity.js';
import { ReturnItem } from '../returns/entities/return-item.entity.js';
import { Consignment } from '../consignments/entities/consignment.entity.js';
import { Voucher } from '../vouchers/entities/voucher.entity.js';
import { StreetDispatch } from '../street/entities/street-dispatch.entity.js';
import { Expense } from '../expenses/entities/expense.entity.js';
import { Bank } from '../banks/entities/bank.entity.js';
import { User } from '../users/entities/user.entity.js';
import { Category } from '../categories/entities/category.entity.js';
import { Product } from '../products/entities/product.entity.js';
import { Size } from '../catalogs/entities/size.entity.js';
import { Color } from '../catalogs/entities/color.entity.js';
import { Supplier } from '../suppliers/entities/supplier.entity.js';
import { ReportsService } from './reports.service.js';
import { ReportsController } from './reports.controller.js';
import { ReportEngineService } from './report-engine.service.js';
import { ReportEngineController } from './report-engine.controller.js';
import { InventoryReportService } from './data/inventory-report.service.js';
import { ValuationReportService } from './data/valuation-report.service.js';
import { ProfitReportService } from './data/profit-report.service.js';
import { PriceControlReportService } from './data/price-control-report.service.js';
import { ReceivablesReportService } from './data/receivables-report.service.js';
import { MovementsReportService } from './data/movements-report.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Sale,
      SaleItem,
      Payment,
      AccountsReceivable,
      AccountsReceivablePayment,
      AccountsPayable,
      AccountsPayablePayment,
      Stock,
      StockUnit,
      StockMovement,
      StockTransfer,
      InventoryCount,
      InventoryCountLine,
      Warehouse,
      ReturnItem,
      Consignment,
      Voucher,
      StreetDispatch,
      Expense,
      Bank,
      User,
      Category,
      Product,
      Size,
      Color,
      Supplier,
    ]),
  ],
  controllers: [ReportsController, ReportEngineController],
  providers: [
    ReportsService,
    ReportEngineService,
    InventoryReportService,
    ValuationReportService,
    ProfitReportService,
    PriceControlReportService,
    ReceivablesReportService,
    MovementsReportService,
  ],
  exports: [ReportsService],
})
export class ReportsModule {}
