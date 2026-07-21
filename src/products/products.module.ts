import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductsService } from './products.service.js';
import { ProductsController } from './products.controller.js';
import { RecipeService } from './services/recipe.service.js';
import { Product } from './entities/product.entity.js';
import { ProductVariant } from './entities/product-variant.entity.js';
import { ProductEssence } from './entities/product-essence.entity.js';
import { StoreSettings } from '../storefront/entities/store-settings.entity.js';
import { Category } from '../categories/entities/category.entity.js';
import { Warehouse } from '../inventory/entities/warehouse.entity.js';
import { Stock } from '../inventory/entities/stock.entity.js';
import { StockMovement } from '../inventory/entities/stock-movement.entity.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Product,
      ProductVariant,
      ProductEssence,
      StoreSettings,
      Category,
      Warehouse,
      Stock,
      StockMovement,
    ]),
  ],
  controllers: [ProductsController],
  providers: [ProductsService, RecipeService],
  exports: [ProductsService, RecipeService],
})
export class ProductsModule {}
