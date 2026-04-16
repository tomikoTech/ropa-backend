import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { StoreSettings } from './entities/store-settings.entity.js';
import { EcommerceOrder } from './entities/ecommerce-order.entity.js';
import { EcommerceOrderItem } from './entities/ecommerce-order-item.entity.js';
import { Product } from '../products/entities/product.entity.js';
import { ProductVariant } from '../products/entities/product-variant.entity.js';
import { Category } from '../categories/entities/category.entity.js';
import { Stock } from '../inventory/entities/stock.entity.js';
import { Promotion } from '../promotions/entities/promotion.entity.js';
import { TaxService, LineCalculation } from '../pos/services/tax.service.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { CalculateCheckoutDto } from './dto/calculate-checkout.dto.js';
import { InvoiceEmailService } from '../common/services/invoice-email.service.js';
import { EcommerceOrderStatus } from '../common/enums/ecommerce-order-status.enum.js';
import { ProductStatus } from '../common/enums/product-status.enum.js';
import { ShippingStatus } from '../common/enums/shipping-status.enum.js';

@Injectable()
export class StorefrontService {
  constructor(
    @InjectRepository(StoreSettings)
    private readonly settingsRepo: Repository<StoreSettings>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(ProductVariant)
    private readonly variantRepo: Repository<ProductVariant>,
    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,
    @InjectRepository(Stock)
    private readonly stockRepo: Repository<Stock>,
    @InjectRepository(Promotion)
    private readonly promotionRepo: Repository<Promotion>,
    @InjectRepository(EcommerceOrder)
    private readonly orderRepo: Repository<EcommerceOrder>,
    @InjectRepository(EcommerceOrderItem)
    private readonly orderItemRepo: Repository<EcommerceOrderItem>,
    private readonly taxService: TaxService,
    private readonly invoiceEmailService: InvoiceEmailService,
  ) {}

  private async resolveTenant(
    tenantSlug: string,
  ): Promise<{ tenantId: string; settings: StoreSettings }> {
    const settings = await this.settingsRepo.findOne({
      where: { storeSlug: tenantSlug, isStorefrontActive: true },
    });
    if (!settings) {
      throw new NotFoundException('Tienda no encontrada');
    }
    return { tenantId: settings.tenantId, settings };
  }

  async getSettings(tenantSlug: string) {
    const { settings } = await this.resolveTenant(tenantSlug);
    return {
      storeName: settings.storeName,
      storeSlug: settings.storeSlug,
      whatsappNumber: settings.whatsappNumber,
      logoUrl: settings.logoUrl,
      heroLogoUrl: settings.heroLogoUrl,
      miniLogoUrl: settings.miniLogoUrl,
      bannerUrl: settings.bannerUrl,
      aboutText: settings.aboutText,
      instagramUrl: settings.instagramUrl,
      facebookUrl: settings.facebookUrl,
      tiktokUrl: settings.tiktokUrl,
      address: settings.address,
      heroTitle: settings.heroTitle,
      heroSubtitle: settings.heroSubtitle,
      accentColor: settings.accentColor,
      wavaEnabled: !!settings.wavaMerchantKey,
      codEnabled: settings.codEnabled,
      codRequireShippingUpfront: settings.codRequireShippingUpfront,
      codUpfrontPercentage: Number(settings.codUpfrontPercentage),
      codSurchargeType: settings.codSurchargeType || null,
      codSurchargeValue: Number(settings.codSurchargeValue),
      shippingCostLocal: Number(settings.shippingCostLocal),
      shippingCostNational: Number(settings.shippingCostNational),
      freeShippingThreshold: settings.freeShippingThreshold
        ? Number(settings.freeShippingThreshold)
        : null,
      storeCityName: settings.storeCityName,
      shippingCostRegional: Number(settings.shippingCostRegional),
      storeDepartment: settings.storeDepartment || null,
      maxShippingCost: settings.maxShippingCost
        ? Number(settings.maxShippingCost)
        : null,
      customHeroHtml: settings.customHeroHtml || null,
      storeFontFamily: settings.storeFontFamily || null,
      storeTheme: settings.storeTheme || 'dark',
      storeBgColor: settings.storeBgColor || null,
    };
  }

  async getActiveStores() {
    const stores = await this.settingsRepo.find({
      where: { isStorefrontActive: true },
    });

    return stores.map((s) => ({
      storeName: s.storeName,
      storeSlug: s.storeSlug,
      logoUrl: s.logoUrl,
      miniLogoUrl: s.miniLogoUrl,
      bannerUrl: s.bannerUrl,
      aboutText: s.aboutText,
      accentColor: s.accentColor,
    }));
  }

  async getHubProducts(limit = 20) {
    const stores = await this.settingsRepo.find({
      where: { isStorefrontActive: true },
    });

    if (stores.length === 0) {
      return [];
    }

    const tenantIds = stores.map((s) => s.tenantId);
    const storeMap = new Map(stores.map((s) => [s.tenantId, s]));

    const allProducts = await this.productRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.variants', 'v', 'v.is_active = true')
      .leftJoinAndSelect('p.category', 'c')
      .where('p.tenant_id IN (:...tenantIds)', { tenantIds })
      .andWhere('p.is_published = true')
      .andWhere('p.status = :status', { status: ProductStatus.ACTIVE })
      .orderBy('p.createdAt', 'DESC')
      .getMany();

    // Shuffle in memory to mix products from different stores
    for (let i = allProducts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allProducts[i], allProducts[j]] = [allProducts[j], allProducts[i]];
    }
    const products = allProducts.slice(0, limit);

    // Load stock for each variant per store's ecommerceWarehouseId (fallback to defaultWarehouseId)
    if (products.length > 0) {
      const variantIds = products.flatMap((p) => p.variants.map((v) => v.id));
      if (variantIds.length > 0) {
        const warehouseIds = stores
          .filter((s) => s.ecommerceWarehouseId || s.defaultWarehouseId)
          .map((s) => s.ecommerceWarehouseId || s.defaultWarehouseId);

        if (warehouseIds.length > 0) {
          const stocks = await this.stockRepo.find({
            where: { variantId: In(variantIds), warehouseId: In(warehouseIds) },
          });
          // Key by variantId+warehouseId
          const stockMap = new Map(
            stocks.map((s) => [`${s.variantId}:${s.warehouseId}`, s.quantity]),
          );

          for (const product of products) {
            const store = storeMap.get(product.tenantId);
            const wId =
              store?.ecommerceWarehouseId || store?.defaultWarehouseId;
            for (const variant of product.variants) {
              (variant as ProductVariant & { stock: number }).stock = wId
                ? (stockMap.get(`${variant.id}:${wId}`) ?? 0)
                : 0;
            }
          }
        }
      }
    }

    return products.map((p) => {
      const store = storeMap.get(p.tenantId);
      return {
        ...p,
        storeName: store?.storeName ?? '',
        storeSlug: store?.storeSlug ?? '',
        accentColor: store?.accentColor ?? '#fff',
      };
    });
  }

  async getProducts(
    tenantSlug: string,
    filters?: {
      categorySlug?: string;
      gender?: string;
      search?: string;
    },
  ) {
    const { tenantId } = await this.resolveTenant(tenantSlug);

    const qb = this.productRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.variants', 'v', 'v.is_active = true')
      .leftJoinAndSelect('p.category', 'c')
      .where('p.tenant_id = :tenantId', { tenantId })
      .andWhere('p.is_published = true')
      .andWhere('p.status = :status', { status: ProductStatus.ACTIVE });

    if (filters?.categorySlug) {
      qb.andWhere('c.slug = :catSlug', { catSlug: filters.categorySlug });
    }
    if (filters?.gender) {
      qb.andWhere('p.gender = :gender', { gender: filters.gender });
    }
    if (filters?.search) {
      const words = filters.search.trim().split(/\s+/).filter(Boolean);
      const conditions = words.map(
        (_, i) =>
          `(p.name ILIKE :q${i} OR p.description ILIKE :q${i} OR c.name ILIKE :q${i})`,
      );
      const params: Record<string, string> = {};
      words.forEach((w, i) => (params[`q${i}`] = `%${w}%`));
      qb.andWhere(`(${conditions.join(' OR ')})`, params);

      const scoreTerms = words.map(
        (_, i) =>
          `(CASE WHEN p.name ILIKE :q${i} THEN 3 ELSE 0 END + ` +
          `CASE WHEN c.name ILIKE :q${i} THEN 2 ELSE 0 END + ` +
          `CASE WHEN p.description ILIKE :q${i} THEN 1 ELSE 0 END)`,
      );
      qb.orderBy(`(${scoreTerms.join(' + ')})`, 'DESC');
    } else {
      qb.orderBy('p.created_at', 'DESC');
    }

    const products = await qb.getMany();

    // Load stock for each variant — sum across ALL warehouses (cascade logic)
    if (products.length > 0) {
      const variantIds = products.flatMap((p) => p.variants.map((v) => v.id));
      if (variantIds.length > 0) {
        const stocks = await this.stockRepo.find({
          where: { variantId: In(variantIds), tenantId },
        });

        // Sum stock across all warehouses per variant
        const stockMap = new Map<string, number>();
        for (const s of stocks) {
          stockMap.set(
            s.variantId,
            (stockMap.get(s.variantId) ?? 0) + Number(s.quantity),
          );
        }

        for (const product of products) {
          for (const variant of product.variants) {
            (variant as ProductVariant & { stock: number }).stock =
              stockMap.get(variant.id) ?? 0;
          }
        }
      }
    }

    return products;
  }

  async getProductBySlug(tenantSlug: string, productSlug: string) {
    const { tenantId } = await this.resolveTenant(tenantSlug);

    const product = await this.productRepo.findOne({
      where: {
        slug: productSlug,
        tenantId,
        isPublished: true,
        status: ProductStatus.ACTIVE,
      },
      relations: ['category', 'variants'],
    });
    if (!product) {
      throw new NotFoundException('Producto no encontrado');
    }

    // Filter to active variants only
    product.variants = product.variants.filter((v) => v.isActive);

    // Load stock — sum across ALL warehouses (cascade deduction logic)
    if (product.variants.length > 0) {
      const variantIds = product.variants.map((v) => v.id);
      const stocks = await this.stockRepo.find({
        where: { variantId: In(variantIds), tenantId },
      });

      const stockMap = new Map<string, number>();
      for (const s of stocks) {
        stockMap.set(
          s.variantId,
          (stockMap.get(s.variantId) ?? 0) + Number(s.quantity),
        );
      }

      for (const variant of product.variants) {
        (variant as ProductVariant & { stock: number }).stock =
          stockMap.get(variant.id) ?? 0;
      }
    }

    return product;
  }

  async getCategories(tenantSlug: string) {
    const { tenantId } = await this.resolveTenant(tenantSlug);

    const categories = await this.categoryRepo.find({
      where: { tenantId, isActive: true, isPublished: true },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });

    // Count published products per category
    const counts = await this.productRepo
      .createQueryBuilder('p')
      .select('p.category_id', 'categoryId')
      .addSelect('COUNT(p.id)', 'count')
      .where('p.tenant_id = :tenantId', { tenantId })
      .andWhere('p.is_published = true')
      .andWhere('p.status = :status', { status: ProductStatus.ACTIVE })
      .groupBy('p.category_id')
      .getRawMany();

    const countMap = new Map(
      counts.map((c: { categoryId: string; count: string }) => [
        c.categoryId,
        parseInt(c.count),
      ]),
    );

    return categories.map((cat) => ({
      ...cat,
      publishedProductCount: countMap.get(cat.id) ?? 0,
    }));
  }

  async getPromotions(tenantSlug: string) {
    const { tenantId } = await this.resolveTenant(tenantSlug);
    const now = new Date();

    return this.promotionRepo.find({
      where: {
        tenantId,
        isActive: true,
        startDate: LessThanOrEqual(now),
        endDate: MoreThanOrEqual(now),
      },
      order: { startDate: 'ASC' },
    });
  }

  async createOrder(tenantSlug: string, dto: CreateOrderDto) {
    // Cross-optional: at least phone or email must be provided
    if (!dto.customerPhone && !dto.customerEmail) {
      throw new BadRequestException(
        'Debes proporcionar al menos un teléfono o correo electrónico',
      );
    }

    // Resolve tenant — allow inactive storefront to prevent race conditions
    const settings = await this.settingsRepo.findOne({
      where: { storeSlug: tenantSlug },
    });
    if (!settings) {
      throw new NotFoundException('Tienda no encontrada');
    }
    if (!settings.isStorefrontActive) {
      throw new BadRequestException('La tienda no está activa');
    }
    const tenantId = settings.tenantId;
    const warehouseId =
      settings.ecommerceWarehouseId || settings.defaultWarehouseId;
    if (!warehouseId) {
      throw new BadRequestException('La tienda no tiene bodega configurada');
    }

    // Validate variants and calculate totals (NO stock deduction — stock is deducted on finalize)
    const variantRepo = this.variantRepo;

    const lineCalcs: LineCalculation[] = [];
    const variantData: {
      variant: ProductVariant;
      quantity: number;
      lineCalc: LineCalculation;
    }[] = [];

    for (const item of dto.items) {
      const variant = await variantRepo.findOne({
        where: { id: item.variantId },
        relations: ['product'],
      });
      if (!variant) {
        throw new NotFoundException(`Variante ${item.variantId} no encontrada`);
      }
      if (variant.tenantId !== tenantId) {
        throw new NotFoundException(`Variante ${item.variantId} no encontrada`);
      }
      if (
        !variant.isActive ||
        variant.product.status !== ProductStatus.ACTIVE ||
        !variant.product.isPublished
      ) {
        throw new BadRequestException(
          `Producto "${variant.product.displayName || variant.product.name}" (${variant.sku}) no está disponible`,
        );
      }

      const unitPrice = variant.priceOverride
        ? Number(variant.priceOverride)
        : Number(variant.product.basePrice);
      const taxRate = Number(variant.product.taxRate);

      const lineCalc = this.taxService.calculateLine(
        unitPrice,
        item.quantity,
        0,
        taxRate,
      );
      lineCalcs.push(lineCalc);

      variantData.push({ variant, quantity: item.quantity, lineCalc });
    }

    const saleTotals = this.taxService.calculateSaleTotals(lineCalcs);

    // Calculate shipping cost based on delivery method
    let shippingCost = 0;
    let effectiveShippingCity = dto.shippingCity || undefined;
    let effectiveShippingAddress = dto.shippingAddress || undefined;
    let pickupDeadline: Date | undefined;
    let effectivePaymentMethod = dto.paymentMethod || 'whatsapp';
    let effectiveShippingStatus: ShippingStatus | undefined = dto.shippingAddress
      ? ShippingStatus.PENDING_SHIPMENT
      : undefined;

    if (dto.deliveryMethod === 'pickup') {
      // Pickup: no shipping cost, use store city, no address
      shippingCost = 0;
      effectiveShippingCity = settings.storeCityName || undefined;
      effectiveShippingAddress = undefined;
      pickupDeadline = new Date(Date.now() + 48 * 60 * 60 * 1000);
      effectiveShippingStatus = undefined;
    } else if (dto.deliveryMethod === 'shipping' || dto.deliveryMethod === 'cod') {
      // 3-tier shipping cost calculation
      const shippingCity = dto.shippingCity || '';
      const shippingDepartment = dto.shippingDepartment || '';
      const storeCityName = settings.storeCityName || '';
      const storeDepartment = settings.storeDepartment || '';

      if (shippingCity === storeCityName && storeCityName) {
        shippingCost = Number(settings.shippingCostLocal);
      } else if (
        shippingDepartment === storeDepartment &&
        storeDepartment &&
        shippingCity !== storeCityName
      ) {
        shippingCost = Number(settings.shippingCostRegional);
      } else {
        shippingCost = Number(settings.shippingCostNational);
      }

      // Apply max shipping cost cap
      if (settings.maxShippingCost) {
        shippingCost = Math.min(shippingCost, Number(settings.maxShippingCost));
      }

      // Apply free shipping threshold
      if (
        settings.freeShippingThreshold &&
        saleTotals.total >= Number(settings.freeShippingThreshold)
      ) {
        shippingCost = 0;
      }

      effectiveShippingStatus = ShippingStatus.PENDING_SHIPMENT;

      // COD specific
      if (dto.deliveryMethod === 'cod') {
        effectivePaymentMethod = 'contraentrega';
      }
    } else {
      // Legacy path (no deliveryMethod specified)
      if (dto.shippingAddress) {
        const subtotal = saleTotals.total;
        if (
          settings.freeShippingThreshold &&
          subtotal >= Number(settings.freeShippingThreshold)
        ) {
          shippingCost = 0;
        } else {
          shippingCost =
            dto.shippingType === 'local'
              ? Number(settings.shippingCostLocal)
              : Number(settings.shippingCostNational);
        }
      }
    }

    // Calculate COD pricing
    const codPricing = this.calculateCodPricing(
      dto.deliveryMethod,
      saleTotals.total,
      shippingCost,
      settings,
    );

    // Generate order number
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
    const todayCount = await this.orderRepo.count({ where: { tenantId } });
    const orderNumber = `EC-${dateStr}-${String(todayCount + 1).padStart(4, '0')}`;

    // Create order (PENDING — no stock deducted yet)
    const orderData: Partial<EcommerceOrder> = {
      orderNumber,
      customerName: dto.customerName,
      customerPhone: dto.customerPhone,
      customerEmail: dto.customerEmail,
      customerNotes: dto.customerNotes,
      subtotal: saleTotals.subtotal,
      discountAmount: saleTotals.discountAmount,
      taxAmount: saleTotals.taxAmount,
      total: saleTotals.total,
      shippingCity: effectiveShippingCity,
      shippingAddress: effectiveShippingAddress,
      shippingAddressDetails: dto.shippingAddressDetails || undefined,
      shippingCost,
      shippingStatus: effectiveShippingStatus,
      status: EcommerceOrderStatus.PENDING,
      paymentMethod: effectivePaymentMethod,
      deliveryMethod: dto.deliveryMethod || undefined,
      pickupDeadline,
      warehouseId,
      tenantId,
      codUpfrontAmount: codPricing.codUpfrontAmount,
      codRemainingAmount: codPricing.codRemainingAmount,
      codSurchargeAmount: codPricing.codSurchargeAmount,
    };
    const order = this.orderRepo.create(orderData as EcommerceOrder);
    const savedOrder = await this.orderRepo.save(order);

    // Create order items (snapshot product info)
    for (const data of variantData) {
      const orderItem = this.orderItemRepo.create({
        orderId: savedOrder.id,
        variantId: data.variant.id,
        productName:
          data.variant.product.displayName || data.variant.product.name,
        productSlug: data.variant.product.slug,
        productImageUrl: data.variant.product.imageUrl,
        variantSku: data.variant.sku,
        variantSize: data.variant.size,
        variantColor: data.variant.color,
        quantity: data.quantity,
        unitPrice: data.lineCalc.unitPrice,
        discountPercent: 0,
        taxRate: data.lineCalc.taxRate,
        lineTotal: data.lineCalc.lineTotal,
        tenantId,
      });
      await this.orderItemRepo.save(orderItem);
    }

    // Build WhatsApp message with product links
    const baseUrl = dto.ecommerceBaseUrl || '';
    const productLines = variantData.map(
      (d) =>
        `${d.variant.product.displayName || d.variant.product.name} (${d.variant.size}, ${d.variant.color}) x${d.quantity}` +
        (baseUrl
          ? `\n  ${baseUrl}/${settings.storeSlug}/products/${d.variant.product.slug}`
          : ''),
    );

    const contactLines: string[] = [];
    if (dto.customerPhone) {
      contactLines.push(`Mi teléfono: ${dto.customerPhone}`);
    }
    if (dto.customerEmail) {
      contactLines.push(`Mi correo: ${dto.customerEmail}`);
    }

    const message = [
      `Hola! Soy ${dto.customerName}.`,
      `Estoy interesado en:`,
      '',
      ...productLines,
      '',
      `Total estimado: $${Number(saleTotals.total).toLocaleString('es-CO')}`,
      ...contactLines,
    ].join('\n');

    // Only generate WhatsApp URL if customer provided a phone number
    const whatsappUrl = dto.customerPhone
      ? `https://wa.me/${settings.whatsappNumber}?text=${encodeURIComponent(message)}`
      : null;

    // Send order confirmation email (fire-and-forget)
    // Skip for Wava payments — email sent after payment confirmation via webhook
    if (dto.customerEmail && dto.paymentMethod !== 'wava') {
      this.invoiceEmailService
        .sendInvoice(tenantId, {
          orderNumber: savedOrder.orderNumber,
          storeName: settings.storeName || 'MiPinta',
          customerName: dto.customerName,
          customerEmail: dto.customerEmail,
          items: variantData.map((d) => ({
            productName:
              d.variant.product.displayName || d.variant.product.name,
            variantInfo: `${d.variant.size} / ${d.variant.color}`,
            quantity: d.quantity,
            unitPrice: d.lineCalc.unitPrice,
            lineTotal: d.lineCalc.lineTotal,
          })),
          subtotal: saleTotals.subtotal,
          discountAmount: saleTotals.discountAmount,
          taxAmount: saleTotals.taxAmount,
          total: saleTotals.total,
          date: new Date(),
        })
        .catch(() => {});
    }

    return {
      orderId: savedOrder.id,
      orderNumber: savedOrder.orderNumber,
      total: savedOrder.total,
      shippingCost,
      codUpfrontAmount: codPricing.codUpfrontAmount,
      codRemainingAmount: codPricing.codRemainingAmount,
      codSurchargeAmount: codPricing.codSurchargeAmount,
      whatsappUrl,
    };
  }

  /** Calculate COD surcharge and upfront/remaining amounts. */
  private calculateCodPricing(
    deliveryMethod: string | undefined,
    productTotal: number,
    shippingCost: number,
    settings: StoreSettings,
  ): {
    codSurchargeAmount: number;
    codUpfrontAmount: number;
    codRemainingAmount: number;
  } {
    if (deliveryMethod !== 'cod') {
      return { codSurchargeAmount: 0, codUpfrontAmount: 0, codRemainingAmount: 0 };
    }

    // 1. Calculate surcharge
    let surcharge = 0;
    const surchargeType = settings.codSurchargeType;
    const surchargeValue = Number(settings.codSurchargeValue);
    if (surchargeType === 'percentage' && surchargeValue > 0) {
      surcharge = productTotal * surchargeValue / 100;
    } else if (surchargeType === 'fixed' && surchargeValue > 0) {
      surcharge = surchargeValue;
    }
    surcharge = Math.round(surcharge * 100) / 100;

    // 2. Grand total (product total + surcharge)
    const grandTotal = productTotal + surcharge;

    // 3. Calculate upfront payment
    let upfront = 0;
    if (settings.codRequireShippingUpfront) {
      upfront += shippingCost;
    }
    const upfrontPercentage = Number(settings.codUpfrontPercentage);
    if (upfrontPercentage > 0) {
      upfront += grandTotal * upfrontPercentage / 100;
    }
    upfront = Math.round(upfront * 100) / 100;

    // 4. Remaining = grandTotal + shippingCost - upfront
    const remaining = Math.round((grandTotal + shippingCost - upfront) * 100) / 100;

    return {
      codSurchargeAmount: surcharge,
      codUpfrontAmount: upfront,
      codRemainingAmount: remaining,
    };
  }

  /** Preview checkout totals including COD pricing. */
  async calculateCheckout(
    tenantSlug: string,
    dto: CalculateCheckoutDto,
  ) {
    const { tenantId, settings } = await this.resolveTenant(tenantSlug);

    // Validate variants and calculate line totals
    const lineCalcs: LineCalculation[] = [];

    for (const item of dto.items) {
      const variant = await this.variantRepo.findOne({
        where: { id: item.variantId },
        relations: ['product'],
      });
      if (!variant) {
        throw new NotFoundException(`Variante ${item.variantId} no encontrada`);
      }
      if (variant.tenantId !== tenantId) {
        throw new NotFoundException(`Variante ${item.variantId} no encontrada`);
      }

      const unitPrice = variant.priceOverride
        ? Number(variant.priceOverride)
        : Number(variant.product.basePrice);
      const taxRate = Number(variant.product.taxRate);

      const lineCalc = this.taxService.calculateLine(
        unitPrice,
        item.quantity,
        0,
        taxRate,
      );
      lineCalcs.push(lineCalc);
    }

    const saleTotals = this.taxService.calculateSaleTotals(lineCalcs);

    // Calculate shipping cost (same logic as createOrder)
    let shippingCost = 0;
    if (dto.deliveryMethod === 'shipping' || dto.deliveryMethod === 'cod') {
      const shippingCity = dto.shippingCity || '';
      const shippingDepartment = dto.shippingDepartment || '';
      const storeCityName = settings.storeCityName || '';
      const storeDepartment = settings.storeDepartment || '';

      if (shippingCity === storeCityName && storeCityName) {
        shippingCost = Number(settings.shippingCostLocal);
      } else if (
        shippingDepartment === storeDepartment &&
        storeDepartment &&
        shippingCity !== storeCityName
      ) {
        shippingCost = Number(settings.shippingCostRegional);
      } else {
        shippingCost = Number(settings.shippingCostNational);
      }

      if (settings.maxShippingCost) {
        shippingCost = Math.min(shippingCost, Number(settings.maxShippingCost));
      }

      if (
        settings.freeShippingThreshold &&
        saleTotals.total >= Number(settings.freeShippingThreshold)
      ) {
        shippingCost = 0;
      }
    }

    // Calculate COD pricing
    const codPricing = this.calculateCodPricing(
      dto.deliveryMethod,
      saleTotals.total,
      shippingCost,
      settings,
    );

    const grandTotal = saleTotals.total + shippingCost + codPricing.codSurchargeAmount;

    return {
      subtotal: saleTotals.subtotal,
      taxAmount: saleTotals.taxAmount,
      discountAmount: saleTotals.discountAmount,
      total: saleTotals.total,
      shippingCost,
      codSurcharge: codPricing.codSurchargeAmount,
      codUpfrontAmount: codPricing.codUpfrontAmount,
      codRemainingAmount: codPricing.codRemainingAmount,
      grandTotal,
    };
  }
}
