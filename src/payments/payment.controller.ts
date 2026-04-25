import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Public } from '../common/decorators/public.decorator.js';
import { WavaService } from './wava.service.js';
import { WompiService } from './wompi.service.js';
import { EcommerceOrder } from '../storefront/entities/ecommerce-order.entity.js';
import { StoreSettings } from '../storefront/entities/store-settings.entity.js';

@ApiTags('Payments')
@Controller('storefront/:tenantSlug/payment')
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name);

  constructor(
    private readonly wavaService: WavaService,
    private readonly wompiService: WompiService,
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

  private hasWompi(settings: StoreSettings): boolean {
    return !!settings.wompiPublicKey && !!settings.wompiIntegritySecret;
  }

  private hasWava(settings: StoreSettings): boolean {
    return !!settings.wavaMerchantKey;
  }

  @Public()
  @Get('gateways')
  async getGateways(@Param('tenantSlug') tenantSlug: string) {
    const settings = await this.getSettings(tenantSlug);
    const wompiEnabled = this.hasWompi(settings);
    const wavaEnabled = this.hasWava(settings);

    if (wompiEnabled) {
      return {
        gateways: [
          { gateway_name: 'Tarjeta de crédito/débito', type: 'CARD' },
          { gateway_name: 'PSE', type: 'PSE' },
          { gateway_name: 'Nequi', type: 'NEQUI' },
          { gateway_name: 'Bancolombia', type: 'BANCOLOMBIA_TRANSFER' },
        ],
        wompiEnabled: true,
        wavaEnabled: false,
      };
    }

    if (wavaEnabled) {
      try {
        const result = await this.wavaService.getPaymentGateways(
          settings.wavaMerchantKey,
        );
        return {
          gateways: result.payment_gateways || [],
          wavaEnabled: true,
          wompiEnabled: false,
        };
      } catch {
        return { gateways: [], wavaEnabled: false, wompiEnabled: false };
      }
    }

    return { gateways: [], wavaEnabled: false, wompiEnabled: false };
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
    const wompiEnabled = this.hasWompi(settings);
    const wavaEnabled = this.hasWava(settings);

    if (!wompiEnabled && !wavaEnabled) {
      throw new BadRequestException(
        'Pagos en linea no configurados para esta tienda',
      );
    }

    this.logger.log(
      `Creating payment for order ${body.orderId} in tenant ${tenantSlug} (provider: ${wompiEnabled ? 'wompi' : 'wava'})`,
    );

    const order = await this.orderRepo.findOne({
      where: { id: body.orderId, tenantId: settings.tenantId },
    });
    if (!order) {
      this.logger.warn(
        `Order ${body.orderId} not found for tenant ${settings.tenantId}`,
      );
      throw new NotFoundException('Orden no encontrada');
    }

    // Return existing payment URL if already created
    if (wompiEnabled && order.wompiTransactionId) {
      return { paymentUrl: order.wavaPaymentUrl, provider: 'wompi' };
    }
    if (!wompiEnabled && order.wavaPaymentUrl) {
      return {
        paymentUrl: order.wavaPaymentUrl,
        wavaOrderId: order.wavaOrderId,
        provider: 'wava',
      };
    }

    const ECOMMERCE_BASE =
      process.env.ECOMMERCE_BASE_URL || 'https://mipinta.shop';
    const sanitize = (url: string) =>
      url.startsWith('http://localhost')
        ? url.replace(/http:\/\/localhost:\d+/, ECOMMERCE_BASE)
        : url;

    const successUrl = sanitize(body.successUrl);
    const cancelUrl = sanitize(body.cancelUrl);

    const isCod = order.paymentMethod === 'contraentrega';
    const chargeAmount = isCod
      ? Number(order.shippingCost)
      : Number(order.total);

    if (wompiEnabled) {
      return this.createWompiPayment(settings, order, chargeAmount, successUrl);
    }

    return this.createWavaPayment(
      settings,
      order,
      chargeAmount,
      isCod,
      successUrl,
      cancelUrl,
      sanitize(body.failureUrl || body.cancelUrl),
    );
  }

  private async createWompiPayment(
    settings: StoreSettings,
    order: EcommerceOrder,
    chargeAmount: number,
    redirectUrl: string,
  ) {
    const amountInCents = Math.round(chargeAmount * 100);
    const reference = `${order.orderNumber}-${Date.now()}`;

    const { checkoutUrl } = this.wompiService.buildCheckoutUrl({
      publicKey: settings.wompiPublicKey,
      integritySecret: settings.wompiIntegritySecret,
      reference,
      amountInCents,
      currency: 'COP',
      redirectUrl,
      customerEmail: order.customerEmail || undefined,
    });

    this.logger.log(
      `Wompi checkout URL built for ${order.orderNumber}, amount: ${amountInCents} cents, ref: ${reference}`,
    );

    await this.orderRepo.update(order.id, {
      wompiTransactionId: reference,
      wompiPaymentStatus: 'PENDING',
      wavaPaymentUrl: checkoutUrl,
      paymentMethod:
        order.paymentMethod === 'contraentrega' ? 'contraentrega' : 'wompi',
    });

    return {
      paymentUrl: checkoutUrl,
      provider: 'wompi',
      reference,
    };
  }

  private async createWavaPayment(
    settings: StoreSettings,
    order: EcommerceOrder,
    chargeAmount: number,
    isCod: boolean,
    successUrl: string,
    cancelUrl: string,
    failureUrl: string,
  ) {
    const description = isCod
      ? `Envio para pedido ${order.orderNumber} - ${settings.storeName}`
      : `Pedido ${order.orderNumber} - ${settings.storeName}`;

    this.logger.log(
      `Calling Wava createPaymentLink for ${order.orderNumber}, amount: ${chargeAmount} (COD: ${isCod})`,
    );
    const link = await this.wavaService.createPaymentLink(
      settings.wavaMerchantKey,
      {
        description,
        amount: chargeAmount,
        currency: 'COP',
        order_key: order.orderNumber,
        redirect_link: successUrl,
        redirect_link_cancel: cancelUrl,
        redirect_link_failure: failureUrl,
      },
    );
    this.logger.log(`Wava link created: ${JSON.stringify(link)}`);

    const paymentUrl = link.link || link.payment_url;
    const wavaId = link.hash || link.payment_link_id || link.id || '';

    await this.orderRepo.update(order.id, {
      wavaOrderId: String(wavaId),
      wavaPaymentStatus: 'pending',
      wavaPaymentUrl: paymentUrl,
      paymentMethod: 'wava_link',
    });

    return { paymentUrl, wavaOrderId: wavaId, provider: 'wava' };
  }

  @Public()
  @Get('status/:orderId')
  async getPaymentStatus(
    @Param('tenantSlug') tenantSlug: string,
    @Param('orderId') orderId: string,
    @Query('transactionId') transactionId?: string,
  ) {
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Orden no encontrada');

    // If Wompi transaction ID is passed (from redirect), verify with Wompi API
    if (transactionId && order.paymentMethod === 'wompi') {
      const settings = await this.getSettings(tenantSlug);
      if (this.hasWompi(settings)) {
        try {
          const tx = await this.wompiService.getTransaction(
            settings.wompiPublicKey,
            transactionId,
          );
          if (tx.status !== order.wompiPaymentStatus) {
            await this.orderRepo.update(order.id, {
              wompiPaymentStatus: tx.status,
            });
            order.wompiPaymentStatus = tx.status;
          }
        } catch (err) {
          this.logger.warn(
            `Wompi status poll failed for ${transactionId}: ${err}`,
          );
        }
      }
    }

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      paymentMethod: order.paymentMethod,
      wavaPaymentStatus: order.wavaPaymentStatus,
      wompiPaymentStatus: order.wompiPaymentStatus,
      total: order.total,
    };
  }
}
