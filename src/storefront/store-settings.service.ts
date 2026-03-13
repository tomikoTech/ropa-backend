import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { StoreSettings } from './entities/store-settings.entity.js';
import { EcommerceOrder } from './entities/ecommerce-order.entity.js';
import { EcommerceOrderItem } from './entities/ecommerce-order-item.entity.js';
import { Stock } from '../inventory/entities/stock.entity.js';
import { StockMovement } from '../inventory/entities/stock-movement.entity.js';
import { UpdateStoreSettingsDto } from './dto/update-store-settings.dto.js';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto.js';
import { EcommerceOrderStatus } from '../common/enums/ecommerce-order-status.enum.js';
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
  ): Promise<EcommerceOrder> {
    return this.dataSource.transaction(async (manager) => {
      const orderRepo = manager.getRepository(EcommerceOrder);
      const stockRepo = manager.getRepository(Stock);
      const movementRepo = manager.getRepository(StockMovement);

      const order = await orderRepo.findOne({
        where: { id, tenantId },
        relations: ['items'],
      });
      if (!order) {
        throw new NotFoundException('Pedido no encontrado');
      }
      if (order.status === EcommerceOrderStatus.DELIVERED) {
        throw new BadRequestException('El pedido ya fue finalizado');
      }
      if (order.status === EcommerceOrderStatus.CANCELLED) {
        throw new BadRequestException(
          'No se puede finalizar un pedido cancelado',
        );
      }

      // Deduct inventory for each item
      for (const item of order.items) {
        const stock = await stockRepo.findOne({
          where: {
            variantId: item.variantId,
            warehouseId: order.warehouseId,
            tenantId,
          },
        });
        if (!stock || stock.quantity < item.quantity) {
          throw new BadRequestException(
            `Stock insuficiente para "${item.productName}" ${item.variantSize}/${item.variantColor}. ` +
              `Disponible: ${stock?.quantity ?? 0}, Requerido: ${item.quantity}`,
          );
        }

        stock.quantity -= item.quantity;
        await stockRepo.save(stock);

        const movement = movementRepo.create({
          variantId: item.variantId,
          warehouseId: order.warehouseId,
          movementType: MovementType.OUT,
          quantity: -item.quantity,
          referenceType: 'ECOMMERCE_ORDER',
          referenceId: order.id,
          notes: `Venta web finalizada ${order.orderNumber}`,
          createdById: userId,
          tenantId,
        });
        await movementRepo.save(movement);
      }

      order.status = EcommerceOrderStatus.DELIVERED;
      await orderRepo.save(order);

      return order;
    });
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
}
