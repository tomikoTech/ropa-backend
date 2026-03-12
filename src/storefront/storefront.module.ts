import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StoreSettings } from './entities/store-settings.entity.js';
import { EcommerceOrder } from './entities/ecommerce-order.entity.js';
import { EcommerceOrderItem } from './entities/ecommerce-order-item.entity.js';
import { Product } from '../products/entities/product.entity.js';
import { ProductVariant } from '../products/entities/product-variant.entity.js';
import { Category } from '../categories/entities/category.entity.js';
import { Stock } from '../inventory/entities/stock.entity.js';
import { StockMovement } from '../inventory/entities/stock-movement.entity.js';
import { Promotion } from '../promotions/entities/promotion.entity.js';
import { StorefrontController } from './storefront.controller.js';
import { StorefrontService } from './storefront.service.js';
import { StoreSettingsController } from './store-settings.controller.js';
import { StoreSettingsService } from './store-settings.service.js';
import { TaxService } from '../pos/services/tax.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      StoreSettings,
      EcommerceOrder,
      EcommerceOrderItem,
      Product,
      ProductVariant,
      Category,
      Stock,
      StockMovement,
      Promotion,
    ]),
  ],
  controllers: [StorefrontController, StoreSettingsController],
  providers: [StorefrontService, StoreSettingsService, TaxService],
  exports: [StoreSettingsService],
})
export class StorefrontModule {}
