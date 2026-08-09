import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Sale } from './entities/sale.entity.js';
import { SaleItem } from './entities/sale-item.entity.js';
import { Payment } from './entities/payment.entity.js';
import { ProductVariant } from '../products/entities/product-variant.entity.js';
import { Stock } from '../inventory/entities/stock.entity.js';
import { StockMovement } from '../inventory/entities/stock-movement.entity.js';
import { AccountsReceivable } from './entities/accounts-receivable.entity.js';
import { AccountsReceivablePayment } from './entities/accounts-receivable-payment.entity.js';
import { StoreSettings } from '../storefront/entities/store-settings.entity.js';
import { Reservation } from '../reservations/entities/reservation.entity.js';
import { PosService } from './pos.service.js';
import { ScanService } from './services/scan.service.js';
import { StockUnit } from '../inventory/entities/stock-unit.entity.js';
import { PosController } from './pos.controller.js';
import { TaxService } from './services/tax.service.js';
import { InvoiceService } from './services/invoice.service.js';
import { ReceiptService } from './services/receipt.service.js';
import { ClientsModule } from '../clients/clients.module.js';
import { Promoter } from '../promoters/promoter.entity.js';
import { PurchaseBoxLine } from '../purchases/entities/purchase-box-line.entity.js';
import { StockUnitEvent } from '../inventory/entities/stock-unit-event.entity.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      StockUnit,
      StockUnitEvent,
      Sale,
      SaleItem,
      Payment,
      ProductVariant,
      Stock,
      StockMovement,
      AccountsReceivable,
      AccountsReceivablePayment,
      StoreSettings,
      Reservation,
      Promoter,
      PurchaseBoxLine,
    ]),
    ClientsModule,
  ],
  controllers: [PosController],
  providers: [
    PosService,
    TaxService,
    InvoiceService,
    ReceiptService,
    ScanService,
  ],
  exports: [PosService],
})
export class PosModule {}
