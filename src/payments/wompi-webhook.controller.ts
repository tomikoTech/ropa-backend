import { Controller, Post, Body, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Public } from '../common/decorators/public.decorator.js';
import { WompiService } from './wompi.service.js';
import { EcommerceOrder } from '../storefront/entities/ecommerce-order.entity.js';
import { EcommerceOrderItem } from '../storefront/entities/ecommerce-order-item.entity.js';
import { StoreSettings } from '../storefront/entities/store-settings.entity.js';
import { EcommerceOrderStatus } from '../common/enums/ecommerce-order-status.enum.js';
import { InvoiceEmailService } from '../common/services/invoice-email.service.js';

@Controller('payments/wompi')
export class WompiWebhookController {
  private readonly logger = new Logger(WompiWebhookController.name);

  constructor(
    private readonly wompiService: WompiService,
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
    this.logger.log(`[WOMPI-WEBHOOK] Event: ${body.event}, payload keys: ${Object.keys(body).join(',')}`);

    if (body.event !== 'transaction.updated') {
      this.logger.log(`[WOMPI-WEBHOOK] Ignoring event type: ${body.event}`);
      return { received: true };
    }

    const tx = body.data?.transaction;
    if (!tx) {
      this.logger.warn('[WOMPI-WEBHOOK] No transaction data in payload');
      return { received: true, matched: false };
    }

    const reference = tx.reference || '';
    const status = tx.status || '';
    const transactionId = tx.id || '';

    this.logger.log(`[WOMPI-WEBHOOK] ref=${reference}, status=${status}, txId=${transactionId}`);

    // Find the order by wompiTransactionId (which stores the reference)
    let order = await this.orderRepo.findOne({
      where: { wompiTransactionId: reference },
      relations: ['items'],
    });

    // Fallback: try matching by orderNumber prefix (reference is "ORDERNUM-timestamp")
    if (!order && reference.includes('-')) {
      const orderNumber = reference.split('-').slice(0, -1).join('-');
      order = await this.orderRepo.findOne({
        where: { orderNumber },
        relations: ['items'],
      });
    }

    if (!order) {
      this.logger.warn(`[WOMPI-WEBHOOK] Order not found for reference: ${reference}`);
      return { received: true, matched: false };
    }

    // Find store settings to validate checksum
    const settings = await this.settingsRepo.findOne({
      where: { tenantId: order.tenantId },
    });

    if (settings?.wompiEventsSecret) {
      const valid = this.wompiService.validateWebhookChecksum(body, settings.wompiEventsSecret);
      if (!valid) {
        this.logger.warn(`[WOMPI-WEBHOOK] Invalid checksum for order ${order.orderNumber}`);
        return { received: true, matched: true, updated: false, reason: 'invalid_checksum' };
      }
      this.logger.log(`[WOMPI-WEBHOOK] Checksum validated for ${order.orderNumber}`);
    } else {
      this.logger.warn(`[WOMPI-WEBHOOK] No events secret configured, skipping checksum validation`);
    }

    // Update wompi status
    await this.orderRepo.update(order.id, {
      wompiPaymentStatus: status,
      wompiTransactionId: reference,
    });

    // Idempotency checks
    if (order.status === EcommerceOrderStatus.CONFIRMED && status === 'APPROVED') {
      this.logger.log(`[WOMPI-WEBHOOK] Order ${order.orderNumber} already CONFIRMED, skipping`);
      return { received: true, matched: true, updated: false, reason: 'already_confirmed' };
    }
    if (order.status === EcommerceOrderStatus.CANCELLED && (status === 'DECLINED' || status === 'ERROR' || status === 'VOIDED')) {
      this.logger.log(`[WOMPI-WEBHOOK] Order ${order.orderNumber} already CANCELLED, skipping`);
      return { received: true, matched: true, updated: false, reason: 'already_cancelled' };
    }

    if (status === 'APPROVED') {
      await this.orderRepo.update(order.id, {
        status: EcommerceOrderStatus.CONFIRMED,
      });
      this.logger.log(`[WOMPI-WEBHOOK] Order ${order.orderNumber} CONFIRMED`);

      if (order.customerEmail && settings) {
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
            this.logger.error(`[WOMPI-WEBHOOK] Failed to send invoice for ${order.orderNumber}: ${err}`),
          );
      }
    } else if (status === 'DECLINED' || status === 'ERROR' || status === 'VOIDED') {
      await this.orderRepo.update(order.id, {
        status: EcommerceOrderStatus.CANCELLED,
      });
      this.logger.log(`[WOMPI-WEBHOOK] Order ${order.orderNumber} ${status} → CANCELLED`);
    }

    return { received: true, matched: true, updated: true };
  }
}
