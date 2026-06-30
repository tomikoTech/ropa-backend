import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  In,
  LessThanOrEqual,
  MoreThanOrEqual,
  SelectQueryBuilder,
} from 'typeorm';
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

  async resolveByDomain(domain: string) {
    const cleaned = domain.toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '').trim();
    const settings = await this.settingsRepo.findOne({
      where: { customDomain: cleaned, isStorefrontActive: true },
    });
    if (!settings) {
      throw new NotFoundException('Dominio no registrado');
    }
    return { storeSlug: settings.storeSlug };
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
      navbarLogoUrl: settings.navbarLogoUrl || null,
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
      wompiEnabled: !!settings.wompiPublicKey && !!settings.wompiIntegritySecret,
      codEnabled: settings.codEnabled,
      flatShippingCost: Number(settings.flatShippingCost) || 0,
      storeCityName: settings.storeCityName || null,
      storeDepartment: settings.storeDepartment || null,
      shippingCostLocal: Number(settings.shippingCostLocal) || 0,
      shippingCostRegional: Number(settings.shippingCostRegional) || 0,
      shippingCostNational: Number(settings.shippingCostNational) || 0,
      shippingCostRemote: Number(settings.shippingCostRemote) || 0,
      shippingExtraItemLocal: Number(settings.shippingExtraItemLocal) || 0,
      shippingExtraItemRegional: Number(settings.shippingExtraItemRegional) || 0,
      shippingExtraItemNational: Number(settings.shippingExtraItemNational) || 0,
      shippingExtraItemRemote: Number(settings.shippingExtraItemRemote) || 0,
      remoteDepartments: settings.remoteDepartments || null,
      customHeroHtml: settings.customHeroHtml || null,
      storeFontFamily: settings.storeFontFamily || null,
      fontSections: settings.fontSections || [],
      navItems: settings.navItems || null,
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
      category?: string;
      gender?: string;
      search?: string;
      inStock?: boolean;
      sizes?: string[];
      page?: number;
      limit?: number | null;
    },
  ) {
    const { tenantId } = await this.resolveTenant(tenantSlug);

    // Resolve category filter once (slug OR name + descendants).
    const catIds = filters?.category
      ? await this.resolveCategoryIds(tenantId, filters.category)
      : null;

    const sizes = (filters?.sizes ?? [])
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const wantInStock = filters?.inStock === true;

    // All WHERE/ORDER filtering shared by the count, id-page and hydrate queries.
    // Does NOT touch the `variants` collection: size/inStock use a correlated
    // EXISTS so the returned `variants` array stays complete (incl. agotadas).
    const applyFilters = (qb: SelectQueryBuilder<Product>) => {
      qb.where('p.tenant_id = :tenantId', { tenantId })
        .andWhere('p.is_published = true')
        .andWhere('p.status = :status', { status: ProductStatus.ACTIVE });

      if (filters?.category) {
        if (!catIds || catIds.length === 0) {
          // No matching category → preserve "0 results" behavior.
          qb.andWhere('1 = 0');
        } else {
          qb.andWhere('p.category_id IN (:...catIds)', { catIds });
        }
      }
      if (filters?.gender) {
        qb.andWhere('p.gender = :gender', { gender: filters.gender });
      }
      if (filters?.search) {
        const words = filters.search.trim().split(/\s+/).filter(Boolean);
        const conditions = words.map(
          (_, i) =>
            `(p.name ILIKE :q${i} OR p.description ILIKE :q${i} OR ` +
            `c.name ILIKE :q${i} OR p.sku_prefix ILIKE :q${i})`,
        );
        const params: Record<string, string> = {};
        words.forEach((w, i) => (params[`q${i}`] = `%${w}%`));
        qb.andWhere(`(${conditions.join(' OR ')})`, params);

        const scoreTerms = words.map(
          (_, i) =>
            `(CASE WHEN p.name ILIKE :q${i} THEN 3 ELSE 0 END + ` +
            `CASE WHEN c.name ILIKE :q${i} THEN 2 ELSE 0 END + ` +
            `CASE WHEN p.sku_prefix ILIKE :q${i} THEN 2 ELSE 0 END + ` +
            `CASE WHEN p.description ILIKE :q${i} THEN 1 ELSE 0 END)`,
        );
        qb.orderBy(`(${scoreTerms.join(' + ')})`, 'DESC');
      } else {
        qb.orderBy('p.created_at', 'DESC');
      }

      if (sizes.length > 0 || wantInStock) {
        const variantConds = ['pv.product_id = p.id', 'pv.is_active = true'];
        const subParams: Record<string, string> = {};
        if (sizes.length > 0) {
          const sizeOr = sizes.map((s, i) => {
            // Pad with spaces so we match whole space-separated tokens:
            // "Eur 42" matches size=42; "ML" does NOT match size=M.
            const escaped = s.replace(/([%_\\])/g, '\\$1');
            subParams[`vsize${i}`] = `% ${escaped} %`;
            return `(' ' || LOWER(pv.size) || ' ') LIKE :vsize${i} ESCAPE '\\'`;
          });
          variantConds.push(`(${sizeOr.join(' OR ')})`);
        }
        const exists = wantInStock
          ? `EXISTS (SELECT 1 FROM product_variants pv ` +
            `JOIN stock st ON st.variant_id = pv.id AND st.tenant_id = p.tenant_id ` +
            `WHERE ${variantConds.join(' AND ')} ` +
            `GROUP BY pv.id HAVING COALESCE(SUM(st.quantity), 0) > 0)`
          : `EXISTS (SELECT 1 FROM product_variants pv ` +
            `WHERE ${variantConds.join(' AND ')})`;
        qb.andWhere(exists, subParams);
      }
    };

    // Optional pagination. Default (no limit) returns the full set (retrocompat).
    const page = filters?.page && filters.page > 0 ? filters.page : 1;
    const limit =
      filters?.limit != null && filters.limit > 0 ? filters.limit : null;

    let products: Product[];
    let total: number;
    if (limit === null) {
      // Unpaginated path: identical query/shape as before (byte-compatible).
      const qb = this.productRepo
        .createQueryBuilder('p')
        .leftJoinAndSelect('p.variants', 'v', 'v.is_active = true')
        .leftJoinAndSelect('p.category', 'c');
      applyFilters(qb);
      products = await qb.getMany();
      total = products.length;
    } else {
      // Paginated path: select the page of product ids WITHOUT the variants
      // collection join (TypeORM's take/skip breaks with collection joins),
      // then hydrate full entities preserving order.
      const idQb = this.productRepo
        .createQueryBuilder('p')
        .leftJoin('p.category', 'c');
      applyFilters(idQb);
      total = await idQb.getCount();
      const idRows = await idQb
        .select('p.id', 'id')
        .offset((page - 1) * limit)
        .limit(limit)
        .getRawMany<{ id: string }>();
      const pageIds = idRows.map((r) => r.id);

      if (pageIds.length === 0) {
        products = [];
      } else {
        const hydrateQb = this.productRepo
          .createQueryBuilder('p')
          .leftJoinAndSelect('p.variants', 'v', 'v.is_active = true')
          .leftJoinAndSelect('p.category', 'c')
          .where('p.id IN (:...pageIds)', { pageIds });
        const fetched = await hydrateQb.getMany();
        const byId = new Map(fetched.map((p) => [p.id, p]));
        products = pageIds
          .map((id) => byId.get(id))
          .filter((p): p is Product => p != null);
      }
    }

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

    return { products, total, page, limit };
  }

  /**
   * Resolve a category filter (slug OR name, case-insensitive) to the set of
   * matching category ids plus all of their descendants (tree via parentId).
   * Returns [] when nothing matches.
   */
  private async resolveCategoryIds(
    tenantId: string,
    term: string,
  ): Promise<string[]> {
    const needle = term.trim().toLowerCase();
    if (!needle) return [];

    const cats = await this.categoryRepo.find({ where: { tenantId } });
    const childrenByParent = new Map<string | null, Category[]>();
    for (const c of cats) {
      const key = c.parentId ?? null;
      const list = childrenByParent.get(key) ?? [];
      list.push(c);
      childrenByParent.set(key, list);
    }

    const matched = cats.filter(
      (c) =>
        c.slug.toLowerCase() === needle || c.name.toLowerCase() === needle,
    );

    const ids = new Set<string>();
    const addWithChildren = (cat: Category) => {
      if (ids.has(cat.id)) return;
      ids.add(cat.id);
      for (const child of childrenByParent.get(cat.id) ?? []) {
        addWithChildren(child);
      }
    };
    matched.forEach(addWithChildren);
    return [...ids];
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
      shippingCost = 0;
      effectiveShippingCity = settings.storeCityName || undefined;
      effectiveShippingAddress = undefined;
      pickupDeadline = new Date(Date.now() + 48 * 60 * 60 * 1000);
      effectiveShippingStatus = undefined;
      effectivePaymentMethod = 'pickup';
    } else if (dto.deliveryMethod === 'shipping' || dto.deliveryMethod === 'cod') {
      const totalItemCount = dto.items.reduce((sum, i) => sum + i.quantity, 0);
      shippingCost = this.calculateShippingCost(
        settings, dto.shippingCity, dto.shippingDepartment, totalItemCount, dto.deliveryMethod,
      );
      effectiveShippingStatus = ShippingStatus.PENDING_SHIPMENT;
      if (dto.deliveryMethod === 'cod') {
        effectivePaymentMethod = 'contraentrega';
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
      shippingDepartment: dto.shippingDepartment || undefined,
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

  private static readonly DEFAULT_REMOTE_DEPARTMENTS = [
    'la guajira', 'cesar', 'magdalena', 'atlantico', 'bolivar',
    'sucre', 'cordoba', 'san andres y providencia', 'arauca',
    'casanare', 'vichada', 'guainia', 'guaviare', 'vaupes',
    'amazonas', 'putumayo', 'norte de santander', 'caqueta',
  ];

  private static normalizeDept(s: string): string {
    return s.toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  private calculateShippingCost(
    settings: StoreSettings,
    shippingCity: string | undefined,
    shippingDepartment: string | undefined,
    totalItemCount: number,
    deliveryMethod: string | undefined,
  ): number {
    if (deliveryMethod === 'pickup') return 0;

    const storeCity = StorefrontService.normalizeDept(settings.storeCityName || '');
    const storeDept = StorefrontService.normalizeDept(settings.storeDepartment || '');
    const destCity = StorefrontService.normalizeDept(shippingCity || '');
    const destDept = StorefrontService.normalizeDept(shippingDepartment || '');

    let baseCost: number;
    let extraItemCost: number;

    if (storeCity && destCity && storeCity === destCity) {
      baseCost = Number(settings.shippingCostLocal) || 0;
      extraItemCost = Number(settings.shippingExtraItemLocal) || 0;
    } else if (storeDept && destDept && storeDept === destDept) {
      baseCost = Number(settings.shippingCostRegional) || 0;
      extraItemCost = Number(settings.shippingExtraItemRegional) || 0;
    } else {
      const remoteDepts = (settings.remoteDepartments || StorefrontService.DEFAULT_REMOTE_DEPARTMENTS)
        .map(StorefrontService.normalizeDept);
      if (destDept && remoteDepts.includes(destDept)) {
        baseCost = Number(settings.shippingCostRemote) || 0;
        extraItemCost = Number(settings.shippingExtraItemRemote) || 0;
      } else {
        baseCost = Number(settings.shippingCostNational) || 0;
        extraItemCost = Number(settings.shippingExtraItemNational) || 0;
      }
    }

    if (baseCost === 0) baseCost = Number(settings.flatShippingCost) || 0;

    let finalCost = totalItemCount <= 1
      ? baseCost
      : baseCost + (totalItemCount - 1) * extraItemCost;

    const maxCost = Number(settings.maxShippingCost) || 0;
    if (maxCost > 0 && finalCost > maxCost) finalCost = maxCost;

    return finalCost;
  }

  /** Calculate COD surcharge and upfront/remaining amounts. */
  private calculateCodPricing(
    deliveryMethod: string | undefined,
    productTotal: number,
    shippingCost: number,
    _settings: StoreSettings,
  ): {
    codSurchargeAmount: number;
    codUpfrontAmount: number;
    codRemainingAmount: number;
  } {
    if (deliveryMethod !== 'cod') {
      return { codSurchargeAmount: 0, codUpfrontAmount: 0, codRemainingAmount: 0 };
    }

    const upfront = shippingCost;
    const remaining = Math.round(productTotal * 100) / 100;

    return {
      codSurchargeAmount: 0,
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

    let shippingCost = 0;
    if (dto.deliveryMethod === 'shipping' || dto.deliveryMethod === 'cod') {
      const totalItemCount = dto.items.reduce((sum, i) => sum + i.quantity, 0);
      shippingCost = this.calculateShippingCost(
        settings, dto.shippingCity, dto.shippingDepartment, totalItemCount, dto.deliveryMethod,
      );
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
