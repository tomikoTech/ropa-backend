import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StreetSeller } from './entities/street-seller.entity.js';
import { StreetDispatch } from './entities/street-dispatch.entity.js';
import { StreetDispatchItem } from './entities/street-dispatch-item.entity.js';
import { ProductVariant } from '../products/entities/product-variant.entity.js';
import { Stock } from '../inventory/entities/stock.entity.js';
import { StockMovement } from '../inventory/entities/stock-movement.entity.js';
import { StockUnit } from '../inventory/entities/stock-unit.entity.js';
import { Sale } from '../pos/entities/sale.entity.js';
import { SaleItem } from '../pos/entities/sale-item.entity.js';
import { Payment } from '../pos/entities/payment.entity.js';
import { StreetService } from './street.service.js';
import { StreetController } from './street.controller.js';
import { InvoiceService } from '../pos/services/invoice.service.js';
import { StockUnitEvent } from '../inventory/entities/stock-unit-event.entity.js';

/**
 * Operación de calle (F6): patinadores y remisión rápida.
 *
 * Reutiliza `InvoiceService` para los consecutivos de la venta que se genera al
 * cuadrar; se declara aquí en vez de importar todo `PosModule` para no arrastrar
 * el POS entero (y evitar una dependencia circular con él).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      StreetSeller,
      StreetDispatch,
      StreetDispatchItem,
      ProductVariant,
      Stock,
      StockMovement,
      StockUnit,
      StockUnitEvent,
      Sale,
      SaleItem,
      Payment,
    ]),
  ],
  controllers: [StreetController],
  providers: [StreetService, InvoiceService],
})
export class StreetModule {}
