import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InternalRequest } from './entities/internal-request.entity.js';
import { InternalRequestItem } from './entities/internal-request-item.entity.js';
import { InternalRequestUnit } from './entities/internal-request-unit.entity.js';
import { InternalRequestShipment } from './entities/internal-request-shipment.entity.js';
import { InternalRequestsController } from './internal-requests.controller.js';
import { InternalRequestsService } from './internal-requests.service.js';
import { ProductVariant } from '../products/entities/product-variant.entity.js';
import { Warehouse } from '../inventory/entities/warehouse.entity.js';
import { Stock } from '../inventory/entities/stock.entity.js';
import { StockMovement } from '../inventory/entities/stock-movement.entity.js';
import { StockTransfer } from '../inventory/entities/stock-transfer.entity.js';
import { StockUnit } from '../inventory/entities/stock-unit.entity.js';
import { StockUnitEvent } from '../inventory/entities/stock-unit-event.entity.js';
import { StockLedgerModule } from '../inventory/ledger/stock-ledger.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      InternalRequest,
      InternalRequestItem,
      InternalRequestUnit,
      InternalRequestShipment,
      ProductVariant,
      Warehouse,
      Stock,
      StockMovement,
      StockTransfer,
      StockUnit,
      StockUnitEvent,
    ]),
    StockLedgerModule,
    NotificationsModule,
  ],
  controllers: [InternalRequestsController],
  providers: [InternalRequestsService],
})
export class InternalRequestsModule {}
