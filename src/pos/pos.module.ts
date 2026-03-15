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
import { PosService } from './pos.service.js';
import { PosController } from './pos.controller.js';
import { TaxService } from './services/tax.service.js';
import { InvoiceService } from './services/invoice.service.js';
import { ReceiptService } from './services/receipt.service.js';
import { ClientsModule } from '../clients/clients.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Sale,
      SaleItem,
      Payment,
      ProductVariant,
      Stock,
      StockMovement,
      AccountsReceivable,
      AccountsReceivablePayment,
      StoreSettings,
    ]),
    ClientsModule,
  ],
  controllers: [PosController],
  providers: [PosService, TaxService, InvoiceService, ReceiptService],
  exports: [PosService],
})
export class PosModule {}
