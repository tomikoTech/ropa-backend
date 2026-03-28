import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WavaService } from './wava.service.js';
import { PaymentController } from './payment.controller.js';
import { WebhookController } from './webhook.controller.js';
import { EcommerceOrder } from '../storefront/entities/ecommerce-order.entity.js';
import { StoreSettings } from '../storefront/entities/store-settings.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([EcommerceOrder, StoreSettings])],
  controllers: [PaymentController, WebhookController],
  providers: [WavaService],
  exports: [WavaService],
})
export class PaymentsModule {}
