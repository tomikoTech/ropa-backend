import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductionService } from './production.service.js';
import { ProductionController } from './production.controller.js';
import { Production } from './entities/production.entity.js';
import { ProductionItem } from './entities/production-item.entity.js';
import { Stock } from '../inventory/entities/stock.entity.js';
import { StockMovement } from '../inventory/entities/stock-movement.entity.js';
import { ProductVariant } from '../products/entities/product-variant.entity.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Production,
      ProductionItem,
      Stock,
      StockMovement,
      ProductVariant,
    ]),
  ],
  controllers: [ProductionController],
  providers: [ProductionService],
  exports: [ProductionService],
})
export class ProductionModule {}
