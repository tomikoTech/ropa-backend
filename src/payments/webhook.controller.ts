import { Controller, Post, Body, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Public } from '../common/decorators/public.decorator.js';
import { WavaService } from './wava.service.js';
import { EcommerceOrder } from '../storefront/entities/ecommerce-order.entity.js';
import { StoreSettings } from '../storefront/entities/store-settings.entity.js';
import { EcommerceOrderStatus } from '../common/enums/ecommerce-order-status.enum.js';

@Controller('payments/wava')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly wavaService: WavaService,
    @InjectRepository(EcommerceOrder)
    private readonly orderRepo: Repository<EcommerceOrder>,
    @InjectRepository(StoreSettings)
    private readonly settingsRepo: Repository<StoreSettings>,
  ) {}

  @Public()
  @Post('webhook')
  async handleWebhook(@Body() body: any) {
    this.logger.log(`Wava webhook received: ${JSON.stringify(body)}`);

    const wavaOrderId = String(
      body?.data?.id_order || body?.data?.id || body?.id_order || '',
    );
    if (!wavaOrderId) {
      this.logger.warn('Webhook missing order ID');
      return { received: true };
    }

    const order = await this.orderRepo.findOne({ where: { wavaOrderId } });
    if (!order) {
      this.logger.warn(`Order not found for wavaOrderId: ${wavaOrderId}`);
      return { received: true };
    }

    const settings = await this.settingsRepo.findOne({
      where: { tenantId: order.tenantId },
    });
    if (!settings?.wavaMerchantKey) {
      this.logger.warn(`No merchant key for tenant ${order.tenantId}`);
      return { received: true };
    }

    try {
      const verified = await this.wavaService.getOrder(
        settings.wavaMerchantKey,
        wavaOrderId,
      );
      const status = verified.status || verified.data?.status || '';

      await this.orderRepo.update(order.id, { wavaPaymentStatus: status });

      if (status === 'confirmed') {
        await this.orderRepo.update(order.id, {
          status: EcommerceOrderStatus.CONFIRMED,
        });
        this.logger.log(
          `Order ${order.orderNumber} payment confirmed via Wava`,
        );
      } else if (status === 'cancelled' || status === 'failed') {
        await this.orderRepo.update(order.id, {
          status: EcommerceOrderStatus.CANCELLED,
        });
        this.logger.log(
          `Order ${order.orderNumber} payment ${status} via Wava`,
        );
      }
    } catch (err) {
      this.logger.error(`Failed to verify Wava order ${wavaOrderId}: ${err}`);
    }

    return { received: true };
  }
}
