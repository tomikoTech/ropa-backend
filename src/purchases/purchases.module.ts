import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PurchaseOrder } from './entities/purchase-order.entity.js';
import { PurchaseBoxLine } from './entities/purchase-box-line.entity.js';
import { PurchaseBoxesService } from './purchase-boxes.service.js';
import { PurchaseBoxesController } from './purchase-boxes.controller.js';
import { Product } from '../products/entities/product.entity.js';
import { Color } from '../catalogs/entities/color.entity.js';
import { SizeCurve } from '../catalogs/entities/size-curve.entity.js';
import { SizeCurveItem } from '../catalogs/entities/size-curve-item.entity.js';
import { PurchaseOrderItem } from './entities/purchase-order-item.entity.js';
import { AccountsPayable } from './entities/accounts-payable.entity.js';
import { AccountsPayablePayment } from './entities/accounts-payable-payment.entity.js';
import { ProductVariant } from '../products/entities/product-variant.entity.js';
import { Stock } from '../inventory/entities/stock.entity.js';
import { StockMovement } from '../inventory/entities/stock-movement.entity.js';
import { StoreSettings } from '../storefront/entities/store-settings.entity.js';
import { Supplier } from '../suppliers/entities/supplier.entity.js';
import { PurchasesService } from './purchases.service.js';
import { PurchasesController } from './purchases.controller.js';
import { StockLedgerModule } from '../inventory/ledger/stock-ledger.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PurchaseOrder,
      PurchaseBoxLine,
      Product,
      Color,
      SizeCurve,
      SizeCurveItem,
      PurchaseOrderItem,
      AccountsPayable,
      AccountsPayablePayment,
      ProductVariant,
      Stock,
      StockMovement,
      StoreSettings,
      Supplier,
    ]),
    StockLedgerModule,
  ],
  controllers: [PurchasesController, PurchaseBoxesController],
  providers: [PurchasesService, PurchaseBoxesService],
  exports: [PurchasesService],
})
export class PurchasesModule {}
