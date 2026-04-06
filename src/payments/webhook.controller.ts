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

    // Wava webhook can send id_order (numeric) or hash — try all possible IDs
    const possibleIds = [
      body?.data?.id_order,
      body?.data?.id,
      body?.id_order,
      body?.data?.hash,
      body?.data?.payment_link_hash,
    ].filter(Boolean).map(String);

    if (possibleIds.length === 0) {
      this.logger.warn('Webhook missing order ID');
      return { received: true };
    }

    this.logger.log(`Looking for order with wavaOrderId in: ${JSON.stringify(possibleIds)}`);

    // Also try matching by order_key (our orderNumber) stored in Wava
    const orderKey = body?.data?.order_key || body?.data?.id_external || '';

    let order: EcommerceOrder | null = null;
    for (const id of possibleIds) {
      order = await this.orderRepo.findOne({
        where: { wavaOrderId: id },
        relations: ['items'],
      });
      if (order) break;
    }

    // Fallback: search by orderNumber if Wava sends order_key
    if (!order && orderKey) {
      order = await this.orderRepo.findOne({
        where: { orderNumber: String(orderKey) },
        relations: ['items'],
      });
      if (order) {
        this.logger.log(`Found order by orderNumber: ${orderKey}`);
      }
    }

    if (!order) {
      this.logger.warn(`Order not found for wavaOrderIds: ${JSON.stringify(possibleIds)}, orderKey: ${orderKey}`);
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
      // Determine status: try webhook body first, then verify with API
      const webhookStatus = body?.data?.status || body?.status || '';
      let status = webhookStatus;

      // Try to verify with Wava API using any available ID
      for (const id of possibleIds) {
        try {
          const verified = await this.wavaService.getOrder(settings.wavaMerchantKey, id);
          status = verified.status || verified.data?.status || webhookStatus;
          break;
        } catch {
          // Try next ID
        }
      }

      if (!status) {
        this.logger.warn(`Could not determine status for order ${order.orderNumber}`);
        return { received: true };
      }

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
      this.logger.error(`Failed to verify Wava order ${order.orderNumber}: ${err}`);
    }

    return { received: true };
  }
}
