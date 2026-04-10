import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { StoreSettings } from './entities/store-settings.entity.js';
import { EcommerceOrder } from './entities/ecommerce-order.entity.js';
import { EcommerceOrderItem } from './entities/ecommerce-order-item.entity.js';
import { Stock } from '../inventory/entities/stock.entity.js';
import { StockMovement } from '../inventory/entities/stock-movement.entity.js';
import { UpdateStoreSettingsDto } from './dto/update-store-settings.dto.js';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto.js';
import { InvoiceEmailService } from '../common/services/invoice-email.service.js';
import { EcommerceOrderStatus } from '../common/enums/ecommerce-order-status.enum.js';
import { ShippingStatus } from '../common/enums/shipping-status.enum.js';
import { MovementType } from '../common/enums/movement-type.enum.js';

@Injectable()
export class StoreSettingsService {
  constructor(
    @InjectRepository(StoreSettings)
    private readonly settingsRepo: Repository<StoreSettings>,
    @InjectRepository(EcommerceOrder)
    private readonly orderRepo: Repository<EcommerceOrder>,
    @InjectRepository(EcommerceOrderItem)
    private readonly orderItemRepo: Repository<EcommerceOrderItem>,
    private readonly dataSource: DataSource,
    private readonly invoiceEmailService: InvoiceEmailService,
  ) {}

  async getSettings(tenantId: string): Promise<StoreSettings> {
    let settings = await this.settingsRepo.findOne({ where: { tenantId } });
    if (!settings) {
      // Auto-create with default slug
      settings = this.settingsRepo.create({
        storeName: 'Mi Tienda',
        storeSlug: `tienda-${tenantId.slice(0, 8)}`,
        tenantId,
      });
      settings = await this.settingsRepo.save(settings);
    }
    return settings;
  }

  async updateSettings(
    tenantId: string,
    dto: UpdateStoreSettingsDto,
  ): Promise<StoreSettings> {
    const settings = await this.getSettings(tenantId);

    if (dto.storeName !== undefined) settings.storeName = dto.storeName;
    if (dto.whatsappNumber !== undefined)
      settings.whatsappNumber = dto.whatsappNumber;
    if (dto.logoUrl !== undefined) settings.logoUrl = dto.logoUrl;
    if (dto.heroLogoUrl !== undefined) settings.heroLogoUrl = dto.heroLogoUrl;
    if (dto.miniLogoUrl !== undefined) settings.miniLogoUrl = dto.miniLogoUrl;
    if (dto.bannerUrl !== undefined) settings.bannerUrl = dto.bannerUrl;
    if (dto.aboutText !== undefined) settings.aboutText = dto.aboutText;
    if (dto.instagramUrl !== undefined)
      settings.instagramUrl = dto.instagramUrl;
    if (dto.facebookUrl !== undefined) settings.facebookUrl = dto.facebookUrl;
    if (dto.tiktokUrl !== undefined) settings.tiktokUrl = dto.tiktokUrl;
    if (dto.address !== undefined) settings.address = dto.address;
    if (dto.heroTitle !== undefined) settings.heroTitle = dto.heroTitle;
    if (dto.heroSubtitle !== undefined)
      settings.heroSubtitle = dto.heroSubtitle;
    if (dto.accentColor !== undefined) settings.accentColor = dto.accentColor;
    if (dto.posAccentColor !== undefined)
      settings.posAccentColor = dto.posAccentColor;
    if (dto.isStorefrontActive !== undefined)
      settings.isStorefrontActive = dto.isStorefrontActive;
    if (dto.defaultWarehouseId !== undefined)
      settings.defaultWarehouseId = dto.defaultWarehouseId;
    if (dto.ecommerceWarehouseId !== undefined)
      settings.ecommerceWarehouseId = dto.ecommerceWarehouseId;
    if (dto.brevoApiKey !== undefined) settings.brevoApiKey = dto.brevoApiKey;
    if (dto.brevoSenderEmail !== undefined)
      settings.brevoSenderEmail = dto.brevoSenderEmail;
    if (dto.wavaMerchantKey !== undefined)
      settings.wavaMerchantKey = dto.wavaMerchantKey;
    if (dto.codEnabled !== undefined) settings.codEnabled = dto.codEnabled;
    if (dto.codRequireShippingUpfront !== undefined)
      settings.codRequireShippingUpfront = dto.codRequireShippingUpfront;
    if (dto.codUpfrontPercentage !== undefined)
      settings.codUpfrontPercentage = dto.codUpfrontPercentage;
    if (dto.codSurchargeType !== undefined)
      settings.codSurchargeType = dto.codSurchargeType;
    if (dto.codSurchargeValue !== undefined)
      settings.codSurchargeValue = dto.codSurchargeValue;
    if (dto.shippingCostLocal !== undefined)
      settings.shippingCostLocal = dto.shippingCostLocal;
    if (dto.shippingCostNational !== undefined)
      settings.shippingCostNational = dto.shippingCostNational;
    if (dto.freeShippingThreshold !== undefined)
      settings.freeShippingThreshold = dto.freeShippingThreshold;
    if (dto.storeCityName !== undefined)
      settings.storeCityName = dto.storeCityName;
    if (dto.shippingCostRegional !== undefined)
      settings.shippingCostRegional = dto.shippingCostRegional;
    if (dto.storeDepartment !== undefined)
      settings.storeDepartment = dto.storeDepartment;
    if (dto.maxShippingCost !== undefined)
      settings.maxShippingCost = dto.maxShippingCost;
    if (dto.customHeroHtml !== undefined)
      settings.customHeroHtml = dto.customHeroHtml;
    if (dto.storeFontFamily !== undefined)
      settings.storeFontFamily = dto.storeFontFamily;
    if (dto.storeTheme !== undefined)
      settings.storeTheme = dto.storeTheme;
    if (dto.storeBgColor !== undefined)
      settings.storeBgColor = dto.storeBgColor;

    return this.settingsRepo.save(settings);
  }

  async findAllOrders(
    tenantId: string,
    filters?: {
      status?: EcommerceOrderStatus;
      limit?: number;
    },
  ): Promise<EcommerceOrder[]> {
    const where: Record<string, unknown> = { tenantId };
    if (filters?.status) where.status = filters.status;

    return this.orderRepo.find({
      where,
      relations: ['items'],
      order: { createdAt: 'DESC' },
      take: filters?.limit || 100,
    });
  }

  async findOneOrder(id: string, tenantId: string): Promise<EcommerceOrder> {
    const order = await this.orderRepo.findOne({
      where: { id, tenantId },
      relations: ['items'],
    });
    if (!order) {
      throw new NotFoundException('Pedido no encontrado');
    }
    return order;
  }

  async updateOrderStatus(
    id: string,
    dto: UpdateOrderStatusDto,
    tenantId: string,
  ): Promise<EcommerceOrder> {
    const order = await this.findOneOrder(id, tenantId);

    if (order.status === EcommerceOrderStatus.CANCELLED) {
      throw new BadRequestException(
        'No se puede actualizar un pedido cancelado',
      );
    }
    if (order.status === EcommerceOrderStatus.DELIVERED) {
      throw new BadRequestException(
        'No se puede actualizar un pedido entregado',
      );
    }

    // Allow CONFIRMED → READY_FOR_PICKUP for pickup orders
    if (
      dto.status === EcommerceOrderStatus.READY_FOR_PICKUP &&
      order.status !== EcommerceOrderStatus.CONFIRMED
    ) {
      throw new BadRequestException(
        'Solo se puede marcar como listo para recogida desde estado CONFIRMED',
      );
    }

    // Allow READY_FOR_PICKUP → DELIVERED
    if (
      order.status === EcommerceOrderStatus.READY_FOR_PICKUP &&
      dto.status !== EcommerceOrderStatus.DELIVERED &&
      dto.status !== EcommerceOrderStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'Desde READY_FOR_PICKUP solo se puede pasar a DELIVERED o CANCELLED',
      );
    }

    order.status = dto.status;
    if (dto.adminNotes !== undefined) {
      order.adminNotes = dto.adminNotes;
    }

    return this.orderRepo.save(order);
  }

  async finalizeOrder(
    id: string,
    userId: string,
    tenantId: string,
    warehouseId?: string,
  ): Promise<EcommerceOrder> {
    const order = await this.dataSource.transaction(async (manager) => {
      const orderRepo = manager.getRepository(EcommerceOrder);
      const stockRepo = manager.getRepository(Stock);
      const movementRepo = manager.getRepository(StockMovement);

      const o = await orderRepo.findOne({
        where: { id, tenantId },
        relations: ['items'],
      });
      if (!o) {
        throw new NotFoundException('Pedido no encontrado');
      }
      if (o.status === EcommerceOrderStatus.DELIVERED) {
        throw new BadRequestException('El pedido ya fue finalizado');
      }
      if (o.status === EcommerceOrderStatus.CANCELLED) {
        throw new BadRequestException(
          'No se puede finalizar un pedido cancelado',
        );
      }

      // Use provided warehouseId or fall back to the order's original warehouse
      const effectiveWarehouseId = warehouseId || o.warehouseId;
      if (!effectiveWarehouseId) {
        throw new BadRequestException(
          'No se ha configurado una bodega para este pedido',
        );
      }

      // Update the order's warehouseId if a different one was provided
      if (warehouseId && warehouseId !== o.warehouseId) {
        o.warehouseId = warehouseId;
      }

      // Batch load all stocks for order variants (1 query instead of N)
      const variantIds = o.items.map((i) => i.variantId);
      const allStocksFlat = await stockRepo.find({
        where: { variantId: In(variantIds), tenantId },
      });
      const stocksByVariant = new Map<string, Stock[]>();
      for (const s of allStocksFlat) {
        const arr = stocksByVariant.get(s.variantId);
        if (arr) arr.push(s);
        else stocksByVariant.set(s.variantId, [s]);
      }

      // Deduct inventory for each item — cascade: default warehouse first, then others by quantity desc
      for (const item of o.items) {
        let remaining = item.quantity;

        const itemStocks = stocksByVariant.get(item.variantId) || [];
        itemStocks.sort((a, b) => {
          if (a.warehouseId === effectiveWarehouseId) return -1;
          if (b.warehouseId === effectiveWarehouseId) return 1;
          return Number(b.quantity) - Number(a.quantity);
        });

        const totalAvailable = itemStocks.reduce(
          (sum, s) => sum + Number(s.quantity),
          0,
        );
        if (totalAvailable < remaining) {
          throw new BadRequestException(
            `Stock insuficiente para "${item.productName}" ${item.variantSize}/${item.variantColor}. ` +
              `Disponible total: ${totalAvailable}, Requerido: ${remaining}`,
          );
        }

        for (const stock of itemStocks) {
          if (remaining <= 0) break;
          const available = Number(stock.quantity);
          if (available <= 0) continue;

          const toDeduct = Math.min(available, remaining);
          stock.quantity = available - toDeduct;
          remaining -= toDeduct;

          await stockRepo.save(stock);

          const movement = movementRepo.create({
            variantId: item.variantId,
            warehouseId: stock.warehouseId,
            movementType: MovementType.OUT,
            quantity: -toDeduct,
            referenceType: 'ECOMMERCE_ORDER',
            referenceId: o.id,
            notes: `Venta web finalizada ${o.orderNumber}`,
            createdById: userId,
            tenantId,
          });
          await movementRepo.save(movement);
        }
      }

      o.status = EcommerceOrderStatus.DELIVERED;
      await orderRepo.save(o);

      return o;
    });

    // Send invoice email asynchronously (fire-and-forget)
    if (order.customerEmail) {
      const settings = await this.settingsRepo.findOne({
        where: { tenantId },
      });
      this.invoiceEmailService
        .sendInvoice(tenantId, {
          orderNumber: order.orderNumber,
          storeName: settings?.storeName || 'MiPinta',
          customerName: order.customerName,
          customerEmail: order.customerEmail,
          items: order.items.map((i) => ({
            productName: i.productName,
            variantInfo: `${i.variantSize} / ${i.variantColor}`,
            quantity: i.quantity,
            unitPrice: Number(i.unitPrice),
            lineTotal: Number(i.lineTotal),
          })),
          subtotal: Number(order.subtotal),
          discountAmount: Number(order.discountAmount),
          taxAmount: Number(order.taxAmount),
          total: Number(order.total),
          date: new Date(),
        })
        .catch(() => {});
    }

    return order;
  }

  async cancelOrder(
    id: string,
    _userId: string,
    tenantId: string,
  ): Promise<EcommerceOrder> {
    const order = await this.orderRepo.findOne({
      where: { id, tenantId },
      relations: ['items'],
    });
    if (!order) {
      throw new NotFoundException('Pedido no encontrado');
    }
    if (order.status === EcommerceOrderStatus.CANCELLED) {
      throw new BadRequestException('El pedido ya está cancelado');
    }
    if (order.status === EcommerceOrderStatus.DELIVERED) {
      throw new BadRequestException(
        'No se puede cancelar un pedido finalizado',
      );
    }

    // No stock to restore — stock is only deducted on finalize
    order.status = EcommerceOrderStatus.CANCELLED;
    await this.orderRepo.save(order);

    return order;
  }

  async updateShippingStatus(
    id: string,
    tenantId: string,
    body: {
      shippingStatus: string;
      shippingTrackingCode?: string;
      shippingCarrier?: string;
    },
  ): Promise<{ order: EcommerceOrder; whatsappNotifyUrl: string | null }> {
    const order = await this.findOneOrder(id, tenantId);

    if (order.status === EcommerceOrderStatus.CANCELLED) {
      throw new BadRequestException(
        'No se puede actualizar envío de un pedido cancelado',
      );
    }

    const status = body.shippingStatus as ShippingStatus;
    if (!Object.values(ShippingStatus).includes(status)) {
      throw new BadRequestException('Estado de envío inválido');
    }

    order.shippingStatus = status;
    if (body.shippingTrackingCode !== undefined) {
      order.shippingTrackingCode = body.shippingTrackingCode;
    }
    if (body.shippingCarrier !== undefined) {
      order.shippingCarrier = body.shippingCarrier;
    }

    // Sync order status with shipping status
    if (status === ShippingStatus.SHIPPED) {
      order.status = EcommerceOrderStatus.SHIPPED;
    } else if (status === ShippingStatus.DELIVERED) {
      order.status = EcommerceOrderStatus.DELIVERED;
    }

    await this.orderRepo.save(order);

    // Build WhatsApp notification URL if customer has phone
    let whatsappNotifyUrl: string | null = null;
    if (order.customerPhone) {
      const settings = await this.settingsRepo.findOne({
        where: { tenantId },
      });
      const storeName = settings?.storeName || 'MiPinta';

      let message = '';
      if (status === ShippingStatus.SHIPPED) {
        message = `Hola ${order.customerName}! Tu pedido ${order.orderNumber} de ${storeName} ha sido enviado.`;
        if (order.shippingCarrier) {
          message += ` Transportadora: ${order.shippingCarrier}.`;
        }
        if (order.shippingTrackingCode) {
          message += ` Código de rastreo: ${order.shippingTrackingCode}.`;
        }
      } else if (status === ShippingStatus.DELIVERED) {
        message = `Hola ${order.customerName}! Tu pedido ${order.orderNumber} de ${storeName} ha sido entregado. Gracias por tu compra!`;
      }

      if (message) {
        whatsappNotifyUrl = `https://wa.me/${order.customerPhone}?text=${encodeURIComponent(message)}`;
      }
    }

    return { order, whatsappNotifyUrl };
  }

  async confirmPickup(
    id: string,
    tenantId: string,
  ): Promise<EcommerceOrder> {
    const order = await this.findOneOrder(id, tenantId);

    if (order.status !== EcommerceOrderStatus.READY_FOR_PICKUP) {
      throw new BadRequestException(
        'Solo se puede confirmar recogida de pedidos en estado READY_FOR_PICKUP',
      );
    }

    order.status = EcommerceOrderStatus.DELIVERED;
    return this.orderRepo.save(order);
  }

  async confirmCodPayment(
    id: string,
    tenantId: string,
  ): Promise<EcommerceOrder> {
    const order = await this.findOneOrder(id, tenantId);

    if (order.paymentMethod !== 'contraentrega') {
      throw new BadRequestException(
        'Este pedido no es contra-entrega',
      );
    }
    if (order.codPaymentConfirmed) {
      throw new BadRequestException(
        'El pago contra-entrega ya fue confirmado',
      );
    }

    order.codPaymentConfirmed = true;
    order.codPaymentConfirmedAt = new Date();
    await this.orderRepo.save(order);

    return order;
  }
}
