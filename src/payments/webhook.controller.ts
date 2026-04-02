import { Controller, Post, Body, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Public } from '../common/decorators/public.decorator.js';
import { WavaService } from './wava.service.js';
import { EcommerceOrder } from '../storefront/entities/ecommerce-order.entity.js';
import { EcommerceOrderItem } from '../storefront/entities/ecommerce-order-item.entity.js';
import { StoreSettings } from '../storefront/entities/store-settings.entity.js';
import { EcommerceOrderStatus } from '../common/enums/ecommerce-order-status.enum.js';
import { InvoiceEmailService } from '../common/services/invoice-email.service.js';

@Controller('payments/wava')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly wavaService: WavaService,
    @InjectRepository(EcommerceOrder)
    private readonly orderRepo: Repository<EcommerceOrder>,
    @InjectRepository(EcommerceOrderItem)
    private readonly orderItemRepo: Repository<EcommerceOrderItem>,
    @InjectRepository(StoreSettings)
    private readonly settingsRepo: Repository<StoreSettings>,
    private readonly invoiceEmailService: InvoiceEmailService,
  ) {}

  @Public()
  @Post('webhook')
  async handleWebhook(@Body() body: any) {
    this.logger.log(`Wava webhook received: ${JSON.stringify(body)}`);

    const wavaOrderId = String(
      body?.data?.id_order || body?.data?.id || body?.id_order || body?.data?.hash || '',
    );
    if (!wavaOrderId) {
      this.logger.warn('Webhook missing order ID');
      return { received: true };
    }

    const order = await this.orderRepo.findOne({
      where: { wavaOrderId },
      relations: ['items'],
    });
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

        // Send invoice email now that payment is confirmed
        if (order.customerEmail) {
          this.invoiceEmailService
            .sendInvoice(order.tenantId, {
              orderNumber: order.orderNumber,
              storeName: settings.storeName || 'MiPinta',
              customerName: order.customerName,
              customerEmail: order.customerEmail,
              items: (order.items || []).map((item) => ({
                productName: item.productName,
                variantInfo: `${item.variantSize} / ${item.variantColor}`,
                quantity: item.quantity,
                unitPrice: Number(item.unitPrice),
                lineTotal: Number(item.lineTotal),
              })),
              subtotal: Number(order.subtotal),
              discountAmount: Number(order.discountAmount),
              taxAmount: Number(order.taxAmount),
              total: Number(order.total),
              date: new Date(),
            })
            .catch((err) =>
              this.logger.error(`Failed to send invoice for ${order.orderNumber}: ${err}`),
            );
        }
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
