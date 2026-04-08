import { Controller, Post, Get, Body, Query, Logger } from '@nestjs/common';
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

  /**
   * Diagnostic endpoint: GET /payments/wava/debug-orders?limit=10
   * Shows recent orders with Wava-related fields for debugging webhook matching.
   * TODO: Remove or protect before going to production.
   */
  @Public()
  @Get('debug-orders')
  async debugOrders(@Query('limit') limit?: string) {
    const take = Math.min(Number(limit) || 10, 50);
    const orders = await this.orderRepo.find({
      order: { createdAt: 'DESC' },
      take,
      select: [
        'id', 'orderNumber', 'status', 'paymentMethod',
        'wavaOrderId', 'wavaPaymentStatus', 'wavaPaymentUrl',
        'total', 'shippingCost', 'customerName', 'createdAt',
      ],
    });
    return {
      count: orders.length,
      orders: orders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        paymentMethod: o.paymentMethod,
        wavaOrderId: o.wavaOrderId,
        wavaPaymentStatus: o.wavaPaymentStatus,
        wavaPaymentUrl: o.wavaPaymentUrl,
        total: o.total,
        shippingCost: o.shippingCost,
        customerName: o.customerName,
        createdAt: o.createdAt,
      })),
    };
  }

  @Public()
  @Post('webhook')
  async handleWebhook(@Body() body: any) {
    this.logger.log(`[WEBHOOK] Full payload: ${JSON.stringify(body)}`);

    // Collect every possible identifier Wava might send
    const possibleIds = [
      body?.data?.id_order,
      body?.data?.id,
      body?.id_order,
      body?.id,
      body?.data?.hash,
      body?.data?.payment_link_hash,
      body?.hash,
    ].filter(Boolean).map(String);

    // Also try matching by order_key (our orderNumber) stored in Wava
    const orderKey = body?.data?.order_key || body?.data?.id_external
      || body?.order_key || body?.id_external || '';

    // Extract status from multiple possible locations
    const webhookStatus = body?.data?.status || body?.status
      || body?.data?.payment_status || body?.payment_status || '';

    this.logger.log(`[WEBHOOK] possibleIds=${JSON.stringify(possibleIds)}, orderKey="${orderKey}", status="${webhookStatus}"`);

    if (possibleIds.length === 0 && !orderKey) {
      this.logger.warn('[WEBHOOK] No identifiers found in payload');
      return { received: true, matched: false };
    }

    let order: EcommerceOrder | null = null;
    let matchedBy = '';

    // Strategy 1: match wavaOrderId against all possible IDs
    for (const id of possibleIds) {
      order = await this.orderRepo.findOne({
        where: { wavaOrderId: id },
        relations: ['items'],
      });
      if (order) { matchedBy = `wavaOrderId=${id}`; break; }
    }

    // Strategy 2: match by orderNumber (order_key)
    if (!order && orderKey) {
      order = await this.orderRepo.findOne({
        where: { orderNumber: String(orderKey) },
        relations: ['items'],
      });
      if (order) matchedBy = `orderNumber=${orderKey}`;
    }

    // Strategy 3: search by wavaPaymentUrl containing any ID (hash is in the URL)
    if (!order) {
      for (const id of possibleIds) {
        const found = await this.orderRepo
          .createQueryBuilder('o')
          .leftJoinAndSelect('o.items', 'items')
          .where('o.wava_payment_url ILIKE :pattern', { pattern: `%${id}%` })
          .getOne();
        if (found) {
          order = found;
          matchedBy = `wavaPaymentUrl contains ${id}`;
          break;
        }
      }
    }

    // Strategy 4: find the most recent pending order (last resort for single-store)
    if (!order && possibleIds.length > 0) {
      order = await this.orderRepo.findOne({
        where: { wavaPaymentStatus: 'pending' },
        relations: ['items'],
        order: { createdAt: 'DESC' },
      });
      if (order) matchedBy = 'most recent pending order (fallback)';
    }

    if (!order) {
      this.logger.warn(`[WEBHOOK] Order NOT FOUND. ids=${JSON.stringify(possibleIds)}, orderKey="${orderKey}"`);
      return { received: true, matched: false };
    }

    this.logger.log(`[WEBHOOK] Order FOUND: ${order.orderNumber} (${order.id}) matched by: ${matchedBy}`);

    // Update wavaOrderId if we matched by a different strategy, so future lookups work
    if (possibleIds.length > 0 && !matchedBy.startsWith('wavaOrderId')) {
      const primaryId = String(possibleIds[0]);
      await this.orderRepo.update(order.id, { wavaOrderId: primaryId });
      this.logger.log(`[WEBHOOK] Updated wavaOrderId to "${primaryId}" for order ${order.orderNumber}`);
    }

    const settings = await this.settingsRepo.findOne({
      where: { tenantId: order.tenantId },
    });
    if (!settings?.wavaMerchantKey) {
      this.logger.warn(`[WEBHOOK] No merchant key for tenant ${order.tenantId}`);
      return { received: true, matched: true, updated: false };
    }

    try {
      // Use webhook status directly — Wava API verification often fails with hash IDs
      let status = webhookStatus;

      // Only try API verification if we have a numeric id_order
      const numericId = body?.data?.id_order || body?.id_order;
      if (numericId && !status) {
        try {
          const verified = await this.wavaService.getOrder(settings.wavaMerchantKey, String(numericId));
          status = verified.status || verified.data?.status || '';
          this.logger.log(`[WEBHOOK] API verification status: ${status}`);
        } catch (err) {
          this.logger.warn(`[WEBHOOK] API verification failed: ${err}`);
        }
      }

      if (!status) {
        this.logger.warn(`[WEBHOOK] No status found for order ${order.orderNumber}, payload had no status field`);
        return { received: true, matched: true, updated: false };
      }

      // Normalize status (Wava may send different casing or values)
      const normalizedStatus = status.toLowerCase().trim();
      this.logger.log(`[WEBHOOK] Updating order ${order.orderNumber} status to: "${normalizedStatus}"`);

      await this.orderRepo.update(order.id, { wavaPaymentStatus: normalizedStatus });

      if (normalizedStatus === 'confirmed' || normalizedStatus === 'completed' || normalizedStatus === 'approved') {
        await this.orderRepo.update(order.id, {
          status: EcommerceOrderStatus.CONFIRMED,
        });
        this.logger.log(`[WEBHOOK] ✓ Order ${order.orderNumber} CONFIRMED`);

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
              this.logger.error(`[WEBHOOK] Failed to send invoice for ${order.orderNumber}: ${err}`),
            );
        }
      } else if (normalizedStatus === 'cancelled' || normalizedStatus === 'failed' || normalizedStatus === 'rejected') {
        await this.orderRepo.update(order.id, {
          status: EcommerceOrderStatus.CANCELLED,
        });
        this.logger.log(`[WEBHOOK] ✗ Order ${order.orderNumber} ${normalizedStatus}`);
      } else {
        this.logger.log(`[WEBHOOK] Order ${order.orderNumber} status updated to "${normalizedStatus}" (no state transition)`);
      }
    } catch (err) {
      this.logger.error(`[WEBHOOK] Error processing order ${order.orderNumber}: ${err}`);
    }

    return { received: true, matched: true, updated: true };
  }
}
