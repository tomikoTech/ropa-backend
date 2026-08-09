import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryService } from './inventory.service.js';
import { LocationsService } from './locations.service.js';
import { LocationsController } from './locations.controller.js';
import { Shelf } from './entities/shelf.entity.js';
import { Stand } from './entities/stand.entity.js';
import { StockUnit } from './entities/stock-unit.entity.js';
import { StockUnitContent } from './entities/stock-unit-content.entity.js';
import { StockUnitsService } from './stock-units.service.js';
import { StockUnitsController } from './stock-units.controller.js';
import { LabelsService } from './labels/labels.service.js';
import { LabelsController } from './labels/labels.controller.js';
import { InventoryCount } from './entities/inventory-count.entity.js';
import { InventoryCountLine } from './entities/inventory-count-line.entity.js';
import { InventoryCountsService } from './inventory-counts.service.js';
import { InventoryCountsController } from './inventory-counts.controller.js';
import { PurchaseBoxLine } from '../purchases/entities/purchase-box-line.entity.js';
import { SizeCurveItem } from '../catalogs/entities/size-curve-item.entity.js';
import { ProductVariant } from '../products/entities/product-variant.entity.js';
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
      StockUnit,
      StockUnitContent,
      InventoryCount,
      InventoryCountLine,
      PurchaseBoxLine,
      SizeCurveItem,
      ProductVariant,
      Warehouse,
      Stock,
      StockMovement,
      StockTransfer,
      StoreSettings,
    ]),
    ProductsModule,
  ],
  controllers: [
    InventoryController,
    LocationsController,
    StockUnitsController,
    LabelsController,
    InventoryCountsController,
  ],
  providers: [
    InventoryService,
    LocationsService,
    StockUnitsService,
    LabelsService,
    InventoryCountsService,
  ],
  exports: [InventoryService, LocationsService, StockUnitsService],
})
export class InventoryModule {}
