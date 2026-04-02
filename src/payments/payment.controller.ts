import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Public } from '../common/decorators/public.decorator.js';
import { WavaService } from './wava.service.js';
import { EcommerceOrder } from '../storefront/entities/ecommerce-order.entity.js';
import { StoreSettings } from '../storefront/entities/store-settings.entity.js';

@ApiTags('Payments')
@Controller('storefront/:tenantSlug/payment')
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name);

  constructor(
    private readonly wavaService: WavaService,
    @InjectRepository(EcommerceOrder)
    private readonly orderRepo: Repository<EcommerceOrder>,
    @InjectRepository(StoreSettings)
    private readonly settingsRepo: Repository<StoreSettings>,
  ) {}

  private async getSettings(tenantSlug: string) {
    const settings = await this.settingsRepo.findOne({
      where: { storeSlug: tenantSlug },
    });
    if (!settings) throw new NotFoundException('Tienda no encontrada');
    return settings;
  }

  @Public()
  @Get('gateways')
  async getGateways(@Param('tenantSlug') tenantSlug: string) {
    const settings = await this.getSettings(tenantSlug);
    if (!settings.wavaMerchantKey)
      return { gateways: [], wavaEnabled: false };
    try {
      const result = await this.wavaService.getPaymentGateways(
        settings.wavaMerchantKey,
      );
      return { gateways: result.payment_gateways || [], wavaEnabled: true };
    } catch {
      return { gateways: [], wavaEnabled: false };
    }
  }

  @Public()
  @Post('create')
  async createPayment(
    @Param('tenantSlug') tenantSlug: string,
    @Body()
    body: {
      orderId: string;
      successUrl: string;
      cancelUrl: string;
      failureUrl?: string;
    },
  ) {
    const settings = await this.getSettings(tenantSlug);
    if (!settings.wavaMerchantKey)
      throw new BadRequestException(
        'Pagos en linea no configurados para esta tienda',
      );

    this.logger.log(`Creating payment for order ${body.orderId} in tenant ${tenantSlug}`);

    const order = await this.orderRepo.findOne({
      where: { id: body.orderId, tenantId: settings.tenantId },
    });
    if (!order) {
      this.logger.warn(`Order ${body.orderId} not found for tenant ${settings.tenantId}`);
      throw new NotFoundException('Orden no encontrada');
    }

    if (order.wavaPaymentUrl) {
      this.logger.log(`Order ${order.orderNumber} already has payment URL, returning existing`);
      return {
        paymentUrl: order.wavaPaymentUrl,
        wavaOrderId: order.wavaOrderId,
      };
    }

    // Wava requires HTTPS URLs — replace localhost with production ecommerce URL
    const ECOMMERCE_BASE = process.env.ECOMMERCE_BASE_URL || 'https://mipinta.shop';
    const sanitize = (url: string) =>
      url.startsWith('http://localhost') ? url.replace(/http:\/\/localhost:\d+/, ECOMMERCE_BASE) : url;

    const successUrl = sanitize(body.successUrl);
    const cancelUrl = sanitize(body.cancelUrl);
    const failureUrl = sanitize(body.failureUrl || body.cancelUrl);

    this.logger.log(`Calling Wava createPaymentLink for ${order.orderNumber}, total: ${order.total}`);
    this.logger.log(`Redirect URLs: success=${successUrl}, cancel=${cancelUrl}`);
    const link = await this.wavaService.createPaymentLink(
      settings.wavaMerchantKey,
      {
        description: `Pedido ${order.orderNumber} - ${settings.storeName}`,
        amount: Number(order.total),
        currency: 'COP',
        order_key: order.orderNumber,
        redirect_link: successUrl,
        redirect_link_cancel: cancelUrl,
        redirect_link_failure: failureUrl,
      },
    );
    this.logger.log(`Wava link created: ${JSON.stringify(link)}`);

    // Wava returns { link: "https://pay.dev.wava.co/...", hash: "..." }
    const paymentUrl = link.link || link.payment_url;
    const wavaId = link.hash || link.payment_link_id || link.id || '';

    await this.orderRepo.update(order.id, {
      wavaOrderId: String(wavaId),
      wavaPaymentStatus: 'pending',
      wavaPaymentUrl: paymentUrl,
      paymentMethod: 'wava_link',
    });

    return {
      paymentUrl,
      wavaOrderId: wavaId,
    };
  }

  @Public()
  @Get('status/:orderId')
  async getPaymentStatus(
    @Param('tenantSlug') tenantSlug: string,
    @Param('orderId') orderId: string,
  ) {
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Orden no encontrada');

    if (order.wavaOrderId) {
      const settings = await this.getSettings(tenantSlug);
      if (settings.wavaMerchantKey) {
        try {
          const wavaOrder = await this.wavaService.getOrder(
            settings.wavaMerchantKey,
            order.wavaOrderId,
          );
          const newStatus = wavaOrder.status || wavaOrder.data?.status;
          if (newStatus && newStatus !== order.wavaPaymentStatus) {
            await this.orderRepo.update(order.id, {
              wavaPaymentStatus: newStatus,
            });
            order.wavaPaymentStatus = newStatus;
          }
        } catch {
          // Silently fail - return what we have
        }
      }
    }

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      paymentMethod: order.paymentMethod,
      wavaPaymentStatus: order.wavaPaymentStatus,
      total: order.total,
    };
  }
}
