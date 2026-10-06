import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EcommerceOrder } from '../storefront/entities/ecommerce-order.entity.js';
import { EcommerceOrderItem } from '../storefront/entities/ecommerce-order-item.entity.js';
import { StoreSettings } from '../storefront/entities/store-settings.entity.js';
import { Client } from '../clients/entities/client.entity.js';
import { ProductVariant } from '../products/entities/product-variant.entity.js';
import { PosModule } from '../pos/pos.module.js';
import { DocumentosModule } from '../documentos/documentos.module.js';
import { PedidosService } from './pedidos.service.js';
import { PedidosController } from './pedidos.controller.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EcommerceOrder,
      EcommerceOrderItem,
      StoreSettings,
      Client,
      ProductVariant,
    ]),
    PosModule,
    DocumentosModule,
  ],
  controllers: [PedidosController],
  providers: [PedidosService],
})
export class PedidosModule {}
