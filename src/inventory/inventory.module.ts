import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryService } from './inventory.service.js';
import { InventoryController } from './inventory.controller.js';
import { Warehouse } from './entities/warehouse.entity.js';
import { Stock } from './entities/stock.entity.js';
import { StockMovement } from './entities/stock-movement.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([Warehouse, Stock, StockMovement])],
  controllers: [InventoryController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
