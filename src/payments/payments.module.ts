import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WavaService } from './wava.service.js';
import { WompiService } from './wompi.service.js';
import { PaymentController } from './payment.controller.js';
import { WebhookController } from './webhook.controller.js';
import { WompiWebhookController } from './wompi-webhook.controller.js';
import { EcommerceOrder } from '../storefront/entities/ecommerce-order.entity.js';
import { EcommerceOrderItem } from '../storefront/entities/ecommerce-order-item.entity.js';
import { StoreSettings } from '../storefront/entities/store-settings.entity.js';
import { InvoiceEmailService } from '../common/services/invoice-email.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([EcommerceOrder, EcommerceOrderItem, StoreSettings])],
  controllers: [PaymentController, WebhookController, WompiWebhookController],
  providers: [WavaService, WompiService, InvoiceEmailService],
  exports: [WavaService, WompiService],
})
export class PaymentsModule {}
