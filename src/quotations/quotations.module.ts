import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Quotation } from './entities/quotation.entity.js';
import { QuotationItem } from './entities/quotation-item.entity.js';
import { ProductVariant } from '../products/entities/product-variant.entity.js';
import { StoreSettings } from '../storefront/entities/store-settings.entity.js';
import { QuotationsService } from './quotations.service.js';
import { QuotationsController } from './quotations.controller.js';
import { TaxService } from '../pos/services/tax.service.js';
import { PosModule } from '../pos/pos.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Quotation,
      QuotationItem,
      ProductVariant,
      StoreSettings,
    ]),
    PosModule, // provee PosService (convertir cotización → venta)
  ],
  controllers: [QuotationsController],
  // TaxService es zero-dep; se re-provee aquí (patrón usado en POS y Storefront).
  providers: [QuotationsService, TaxService],
})
export class QuotationsModule {}
