import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryService } from './inventory.service.js';
import { LocationsService } from './locations.service.js';
import { LocationsController } from './locations.controller.js';
import { Shelf } from './entities/shelf.entity.js';
import { Stand } from './entities/stand.entity.js';
import { InventoryController } from './inventory.controller.js';
import { Warehouse } from './entities/warehouse.entity.js';
import { Stock } from './entities/stock.entity.js';
import { StockMovement } from './entities/stock-movement.entity.js';
import { StockTransfer } from './entities/stock-transfer.entity.js';
import { StoreSettings } from '../storefront/entities/store-settings.entity.js';
import { ProductsModule } from '../products/products.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Shelf,
      Stand,
      Warehouse,
      Stock,
      StockMovement,
      StockTransfer,
      StoreSettings,
    ]),
    ProductsModule,
  ],
  controllers: [InventoryController, LocationsController],
  providers: [InventoryService, LocationsService],
  exports: [InventoryService, LocationsService],
})
export class InventoryModule {}
