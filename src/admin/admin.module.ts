import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StoreSettings } from '../storefront/entities/store-settings.entity.js';
import { Product } from '../products/entities/product.entity.js';
import { Category } from '../categories/entities/category.entity.js';
import { ProductsModule } from '../products/products.module.js';
import { CategoriesModule } from '../categories/categories.module.js';
import { SupabaseStorageService } from '../common/services/supabase-storage.service.js';
import { AdminProductsController } from './admin-products.controller.js';
import { AdminProductsService } from './admin-products.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([StoreSettings, Product, Category]),
    ProductsModule,
    CategoriesModule,
  ],
  controllers: [AdminProductsController],
  providers: [AdminProductsService, SupabaseStorageService],
})
export class AdminModule {}
