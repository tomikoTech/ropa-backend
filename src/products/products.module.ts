import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductsService } from './products.service.js';
import { ProductsController } from './products.controller.js';
import { Product } from './entities/product.entity.js';
import { ProductVariant } from './entities/product-variant.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([Product, ProductVariant])],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
