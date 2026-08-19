import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, In } from 'typeorm';
import { RecipeService } from './services/recipe.service.js';
import { BrandsService } from '../brands/brands.service.js';
import { SizesService } from '../catalogs/sizes.service.js';
import { ColorsService } from '../catalogs/colors.service.js';
import { ProductEssence } from './entities/product-essence.entity.js';
import { Product } from './entities/product.entity.js';
import { ProductVariant } from './entities/product-variant.entity.js';
import { StoreSettings } from '../storefront/entities/store-settings.entity.js';
import { Category } from '../categories/entities/category.entity.js';
import { Warehouse } from '../inventory/entities/warehouse.entity.js';
import { Stock } from '../inventory/entities/stock.entity.js';
import { StockUnit, StockUnitKind, StockUnitStatus } from '../inventory/entities/stock-unit.entity.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';
import { retryOnUniqueViolation } from '../common/utils/db-errors.util.js';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(ProductVariant)
    private readonly variantRepository: Repository<ProductVariant>,
    @InjectRepository(StoreSettings)
    private readonly storeSettingsRepo: Repository<StoreSettings>,
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
    @InjectRepository(Warehouse)
    private readonly warehouseRepository: Repository<Warehouse>,
    @InjectRepository(Stock)
    private readonly stockRepository: Repository<Stock>,
    @InjectRepository(StockUnit)
    private readonly stockUnitRepository: Repository<StockUnit>,
    @InjectRepository(ProductEssence)
    private readonly essenceRepository: Repository<ProductEssence>,
    private readonly recipeService: RecipeService,
    private readonly brandsService: BrandsService,
    private readonly sizesService: SizesService,
    private readonly colorsService: ColorsService,
    private readonly dataSource: DataSource,
  ) {}

  // Crea un "Frasco {nombre}" en la categoría Frascos, con una variante y
  // stock 0 en la bodega FRASCOS, y lo vincula a la loción. Devuelve el
  // variantId del frasco (o null si no existe la categoría Frascos).
  private async createFrascoForProduct(
    locion: Product,
    tenantId: string,
  ): Promise<string | null> {
    const frascosCat = await this.categoryRepository
      .createQueryBuilder('c')
      .where('c.tenant_id = :tenantId', { tenantId })
      .andWhere('LOWER(c.name) = :n', { n: 'frascos' })
      .getOne();
    if (!frascosCat) return null;

    const name = `Frasco ${locion.name}`;
    const skuPrefix = await this.ensureUniqueSkuPrefix(
      this.generateSkuPrefix(name),
      tenantId,
    );
    const slug = await this.ensureUniqueSlug(this.generateSlug(name), tenantId);

    const frasco = this.productRepository.create({
      name,
      skuPrefix,
      slug,
      basePrice: 0,
      costPrice: 0,
      gender: locion.gender,
      categoryId: frascosCat.id,
      taxRate: 0,
      // El frasco hereda la foto de la loción relacionada (se mantiene
      // sincronizada en update()).
      imageUrl: locion.imageUrl ?? locion.imageUrls?.[0] ?? undefined,
      imageUrls: locion.imageUrls ?? [],
      description: '[auto-frasco]',
      tenantId,
    });
    const savedFrasco = await this.productRepository.save(frasco);

    const savedVariant = await this.createVariantFor(
      savedFrasco,
      { size: 'Única', color: 'Único' },
      tenantId,
    );

    // Stock 0 en bodega FRASCOS (si existe)
    const frascosWh = await this.warehouseRepository
      .createQueryBuilder('w')
      .where('w.tenant_id = :tenantId', { tenantId })
      .andWhere('LOWER(w.name) = :n', { n: 'frascos' })
      .getOne();
    if (frascosWh) {
      await this.stockRepository.save(
        this.stockRepository.create({
          variantId: savedVariant.id,
          warehouseId: frascosWh.id,
          quantity: 0,
          minStock: 0,
          tenantId,
        }),
      );
    }

    return savedVariant.id;
  }

  // Cuando el tenant tiene la gestión automática de frascos activada,
  // cada loción tiene un "Frasco {nombre}" vinculado cuyo nombre se
  // sincroniza con el de la loción. Desactivado para el resto de tenants.
  private async isFrascoAutoManaged(tenantId: string): Promise<boolean> {
    const s = await this.storeSettingsRepo.findOne({ where: { tenantId } });
    return !!s?.frascoAutoManaged;
  }

  private async isEssenceAutoManaged(tenantId: string): Promise<boolean> {
    const s = await this.storeSettingsRepo.findOne({ where: { tenantId } });
    return !!s?.essenceAutoManaged;
  }

  // Crea una "Esencia {nombre}" en la categoría Esencias (tipo ESSENCE), con
  // una variante y stock 0 en la bodega ESENCIAS (si existe), y la vincula a la
  // loción en la receta con 0 gramos (sin definir aún). El objetivo es que la
  // esencia quede disponible para buscarla al registrar compras; los gramos por
  // unidad se definen después desde la receta del producto. Devuelve el
  // variantId de la esencia (o null si no existe la categoría Esencias).
  private async createEssenceForProduct(
    locion: Product,
    tenantId: string,
  ): Promise<string | null> {
    const essenceCat = await this.categoryRepository
      .createQueryBuilder('c')
      .where('c.tenant_id = :tenantId', { tenantId })
      .andWhere("(c.type = 'ESSENCE' OR LOWER(c.name) = :n)", { n: 'esencias' })
      .getOne();
    if (!essenceCat) return null;

    const name = `Esencia ${locion.name}`;
    const skuPrefix = await this.ensureUniqueSkuPrefix(
      this.generateSkuPrefix(name),
      tenantId,
    );
    const slug = await this.ensureUniqueSlug(this.generateSlug(name), tenantId);

    const essence = this.productRepository.create({
      name,
      skuPrefix,
      slug,
      basePrice: 0,
      costPrice: 0,
      gender: locion.gender,
      categoryId: essenceCat.id,
      taxRate: 0,
      description: '[auto-esencia]',
      tenantId,
    });
    const savedEssence = await this.productRepository.save(essence);

    const savedVariant = await this.createVariantFor(
      savedEssence,
      { size: 'Única', color: 'Único' },
      tenantId,
    );

    // Stock 0 en bodega ESENCIAS (si existe)
    const essenceWh = await this.warehouseRepository
      .createQueryBuilder('w')
      .where('w.tenant_id = :tenantId', { tenantId })
      .andWhere('LOWER(w.name) = :n', { n: 'esencias' })
      .getOne();
    if (essenceWh) {
      await this.stockRepository.save(
        this.stockRepository.create({
          variantId: savedVariant.id,
          warehouseId: essenceWh.id,
          quantity: 0,
          minStock: 0,
          tenantId,
        }),
      );
    }

    // Vincular a la receta de la loción con 0 gramos (sin definir aún).
    await this.essenceRepository.save(
      this.essenceRepository.create({
        productId: locion.id,
        essenceVariantId: savedVariant.id,
        gramsPerUnit: 0,
        tenantId,
      }),
    );

    return savedVariant.id;
  }

  private generateSkuPrefix(name: string): string {
    const prefix = name
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 6);
    // Un nombre sin letras ni n\u00fameros (p.ej. "\u2605\u2605\u2605") dejar\u00eda el prefijo vac\u00edo y
    // todos esos productos chocar\u00edan entre s\u00ed.
    return prefix || 'PROD';
  }

  /**
   * Devuelve un skuPrefix libre dentro del tenant. Es obligatorio porque
   * `generateSkuPrefix` trunca a 6 caracteres: en perfumer\u00eda todos los nombres
   * "Esencia X" producen el mismo prefijo "ESENCI", as\u00ed que las colisiones son
   * la norma, no la excepci\u00f3n. Resuelve en una sola consulta (trae los prefijos
   * ya usados que empiezan por la base) y busca el primer sufijo libre.
   */
  private async ensureUniqueSkuPrefix(
    base: string,
    tenantId: string,
    excludeId?: string,
  ): Promise<string> {
    const qb = this.productRepository
      .createQueryBuilder('p')
      .select('p.skuPrefix', 'prefix')
      .where('p.tenantId = :tenantId', { tenantId })
      // `base` solo contiene [A-Z0-9], as\u00ed que no necesita escape para LIKE.
      .andWhere('p.skuPrefix LIKE :like', { like: `${base}%` });
    if (excludeId) qb.andWhere('p.id != :excludeId', { excludeId });

    const rows = await qb.getRawMany<{ prefix: string }>();
    const taken = new Set(rows.map((r) => r.prefix));

    if (!taken.has(base)) return base;
    let n = 2;
    while (taken.has(`${base}${n}`)) n++;
    return `${base}${n}`;
  }

  private generateSku(prefix: string, size?: string, color?: string): string {
    const parts = [prefix];
    if (size)
      parts.push(
        size
          .toUpperCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^A-Z0-9]/g, ''),
      );
    if (color)
      parts.push(
        color
          .toUpperCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^A-Z0-9]/g, '')
          .slice(0, 3),
      );
    if (parts.length === 1) parts.push(this.generateBarcode().slice(-4));
    return parts.join('-');
  }

  private async ensureUniqueSku(
    baseSku: string,
    tenantId: string,
  ): Promise<string> {
    // Una sola consulta con los SKU ya usados que arrancan por la base: con
    // productos de muchas variantes, el bucle de un SELECT por candidato se
    // volvía cientos de consultas por guardado.
    const rows = await this.variantRepository
      .createQueryBuilder('v')
      .select('v.sku', 'sku')
      .where('v.tenantId = :tenantId', { tenantId })
      .andWhere('v.sku LIKE :like', { like: `${baseSku}%` })
      .getRawMany<{ sku: string }>();
    const taken = new Set(rows.map((r) => r.sku));

    if (!taken.has(baseSku)) return baseSku;
    let counter = 2;
    while (taken.has(`${baseSku}-${counter}`)) counter++;
    return `${baseSku}-${counter}`;
  }

  // El código de barras se genera con timestamp + aleatorio: dos variantes
  // creadas en el mismo milisegundo pueden chocar contra el índice único.
  private async ensureUniqueBarcode(tenantId: string): Promise<string> {
    for (let i = 0; i < 10; i++) {
      const barcode = this.generateBarcode();
      const exists = await this.variantRepository.findOne({
        where: { barcode, tenantId },
      });
      if (!exists) return barcode;
    }
    // Fallback prácticamente imposible de alcanzar; añade entropía extra.
    return `${this.generateBarcode()}${Math.floor(Math.random() * 1000)}`;
  }

  // Crea una variante resolviendo SKU y código de barras libres. El retry cubre
  // la carrera entre el cálculo y el INSERT (dos guardados simultáneos).
  private async createVariantFor(
    product: Pick<Product, 'id' | 'skuPrefix'>,
    v: { size?: string; color?: string; priceOverride?: number | null },
    tenantId: string,
  ): Promise<ProductVariant> {
    // La talla y el color se resuelven contra el catálogo (creándolos si aún no
    // existen) para que la variante quede con su FK. Es el único punto por el
    // que la aplicación crea variantes, así que aquí se garantiza que no vuelva
    // a aparecer talla/color "sueltos" fuera del catálogo.
    const [sizeEntity, colorEntity] = await Promise.all([
      this.sizesService.ensure(v.size, tenantId),
      this.colorsService.ensure(v.color, tenantId),
    ]);

    return retryOnUniqueViolation(async () => {
      const sku = await this.ensureUniqueSku(
        this.generateSku(product.skuPrefix, v.size, v.color),
        tenantId,
      );
      const variant = this.variantRepository.create({
        productId: product.id,
        sku,
        sizeId: sizeEntity?.id ?? null,
        colorId: colorEntity?.id ?? null,
        // Texto para la respuesta inmediata: @AfterLoad solo corre al leer.
        size: sizeEntity?.name ?? '',
        color: colorEntity?.name ?? '',
        barcode: await this.ensureUniqueBarcode(tenantId),
        priceOverride: v.priceOverride || null,
        tenantId,
      });
      return this.variantRepository.save(variant);
    });
  }

  private generateBarcode(): string {
    const timestamp = Date.now().toString().slice(-8);
    const random = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, '0');
    return `78${timestamp}${random}`;
  }

  generateSlug(name: string): string {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private async ensureUniqueSlug(
    slug: string,
    tenantId: string,
    excludeId?: string,
  ): Promise<string> {
    let candidate = slug;
    let counter = 2;
    while (true) {
      const existing = await this.productRepository.findOne({
        where: { slug: candidate, tenantId },
      });
      if (!existing || (excludeId && existing.id === excludeId)) {
        return candidate;
      }
      candidate = `${slug}-${counter}`;
      counter++;
    }
  }

  async create(dto: CreateProductDto, tenantId: string): Promise<Product> {
    if (dto.categoryId) {
      const category = await this.categoryRepository.findOne({
        where: { id: dto.categoryId, tenantId },
      });
      if (!category) {
        throw new NotFoundException('La categoría seleccionada no existe');
      }
    }
    if (dto.frascoVariantId) {
      const frascoVariant = await this.variantRepository.findOne({
        where: { id: dto.frascoVariantId, tenantId },
      });
      if (!frascoVariant) {
        throw new NotFoundException('El frasco seleccionado no existe');
      }
    }

    // El prefijo y el slug se calculan a partir del estado actual de la tabla,
    // así que dos creaciones simultáneas pueden elegir el mismo valor. El retry
    // recalcula ambos con el estado ya actualizado en vez de devolver un 500.
    const saved = await retryOnUniqueViolation(async () => {
      const skuPrefix = await this.ensureUniqueSkuPrefix(
        this.generateSkuPrefix(dto.name),
        tenantId,
      );
      const slug = await this.ensureUniqueSlug(
        this.generateSlug(dto.name),
        tenantId,
      );

      const product = this.productRepository.create({
        name: dto.name,
        displayName: dto.displayName,
        skuPrefix,
        slug,
        description: dto.description,
        basePrice: dto.basePrice,
        costPrice: dto.costPrice ?? 0,
        wholesalePrice: dto.wholesalePrice ?? null,
        minimumSalePrice: dto.minimumSalePrice ?? null,
        gender: dto.gender,
        categoryId: dto.categoryId,
        brand: dto.brand?.trim() || undefined,
        lote: dto.lote?.trim() || undefined,
        frascoVariantId: dto.frascoVariantId ?? null,
        taxRate: dto.taxRate ?? 19,
        imageUrl: dto.imageUrl || dto.imageUrls?.[0],
        imageUrls: dto.imageUrls ?? [],
        videoUrl: dto.videoUrl,
        unitTracking: dto.unitTracking ?? false,
        tenantId,
      });

      return this.productRepository.save(product);
    });

    await this.brandsService.ensure(dto.brand, tenantId);

    // Create variants
    if (dto.variants && dto.variants.length > 0) {
      for (const v of dto.variants) {
        await this.createVariantFor(saved, v, tenantId);
      }
    }

    // Auto-crear frasco vinculado (perfumería): opt-in por producto y
    // gated por el flag del tenant.
    if (
      dto.autoCreateFrasco &&
      !dto.frascoVariantId &&
      (await this.isFrascoAutoManaged(tenantId))
    ) {
      const frascoVariantId = await this.createFrascoForProduct(
        saved,
        tenantId,
      );
      if (frascoVariantId) {
        saved.frascoVariantId = frascoVariantId;
        await this.productRepository.save(saved);
      }
    }

    // Receta de esencias (perfumería): muchos-a-muchos con gramos por unidad.
    if (dto.essences) {
      await this.recipeService.replaceRecipe(
        this.dataSource.manager,
        saved.id,
        tenantId,
        dto.essences,
      );
    }
    // Relación inversa (esencia → productos que la usan).
    if (dto.usedInProducts) {
      await this.recipeService.replaceUsedIn(
        this.dataSource.manager,
        saved.id,
        tenantId,
        dto.usedInProducts,
      );
    }

    // Auto-crear esencia vinculada (perfumería): opt-in por producto y gated
    // por el flag del tenant. Se ejecuta después de la receta manual para no
    // pisarla (createEssenceForProduct hace append, no replace).
    if (dto.autoCreateEssence && (await this.isEssenceAutoManaged(tenantId))) {
      await this.createEssenceForProduct(saved, tenantId);
    }

    return this.findOne(saved.id, tenantId);
  }

  async findAll(tenantId: string): Promise<Product[]> {
    return this.productRepository.find({
      where: { tenantId },
      relations: ['category', 'variants'],
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Listado paginado + filtrado en el servidor (para la tabla de productos).
   * Evita traer TODO el catálogo (payload de cientos de KB) en cada carga.
   * `find` con take/skip pagina bien aunque haya relaciones one-to-many
   * (TypeORM no cae en el bug del LIMIT sobre el JOIN).
   */
  async findPaginated(
    tenantId: string,
    opts: {
      page?: number;
      limit?: number;
      search?: string;
      categoryIds?: string[];
      gender?: string;
      type?: string;
      sort?: string;
    },
  ): Promise<{
    data: Product[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const page = Math.max(1, opts.page || 1);
    const limit = Math.min(200, Math.max(1, opts.limit || 30));

    // Paso 1: IDs de la página aplicando TODOS los filtros en el servidor.
    // leftJoin (no select) a category para poder filtrar por su `type` sin
    // multiplicar filas (es many-to-one). Así take/skip pagina productos bien.
    const qb = this.productRepository
      .createQueryBuilder('p')
      .leftJoin('p.category', 'c')
      .where('p.tenantId = :tenantId', { tenantId });

    if (opts.categoryIds && opts.categoryIds.length) {
      qb.andWhere('p.categoryId IN (:...categoryIds)', {
        categoryIds: opts.categoryIds,
      });
    }
    if (opts.gender) {
      qb.andWhere('p.gender = :gender', { gender: opts.gender });
    }
    if (opts.type) {
      // type de la categoría (STANDARD/ESSENCE/FRASCO); null => STANDARD.
      qb.andWhere("COALESCE(c.type, 'STANDARD') = :type", { type: opts.type });
    }
    if (opts.search && opts.search.trim()) {
      qb.andWhere(
        '(p.name ILIKE :q OR p.skuPrefix ILIKE :q OR p.brand ILIKE :q)',
        { q: `%${opts.search.trim()}%` },
      );
    }

    const stockQuantitySql = `(
      SELECT COALESCE(SUM(stock_sort.quantity), 0)
      FROM stock stock_sort
      INNER JOIN product_variants variant_sort
        ON variant_sort.id = stock_sort.variant_id
      WHERE variant_sort.product_id = p.id
        AND stock_sort.tenant_id = :tenantId
    )`;
    qb.addSelect(stockQuantitySql, 'inventory_quantity');
    switch (opts.sort) {
      case 'stock-asc':
        qb.orderBy('inventory_quantity', 'ASC');
        break;
      case 'name-asc':
        qb.orderBy('p.name', 'ASC');
        break;
      case 'name-desc':
        qb.orderBy('p.name', 'DESC');
        break;
      case 'stock-desc':
      default:
        qb.orderBy('inventory_quantity', 'DESC');
        break;
    }
    qb.addOrderBy('p.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [rows, total] = await qb.getManyAndCount();

    // Paso 2: cargar esos productos CON relaciones (category, variants),
    // preservando el orden de la página.
    const ids = rows.map((r) => r.id);
    let data: Product[] = [];
    if (ids.length) {
      const withRel = await this.productRepository.find({
        where: { id: In(ids) },
        relations: ['category', 'variants'],
      });
      const byId = new Map(withRel.map((p) => [p.id, p]));
      data = ids.map((id) => byId.get(id)!).filter(Boolean);
    }

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string, tenantId: string): Promise<Product> {
    const product = await this.productRepository.findOne({
      where: { id, tenantId },
      relations: ['category', 'variants'],
    });
    if (!product) {
      throw new NotFoundException('Producto no encontrado');
    }
    return product;
  }

  async update(
    id: string,
    dto: UpdateProductDto,
    tenantId: string,
  ): Promise<Product> {
    const product = await this.findOne(id, tenantId);

    if (dto.name !== undefined) {
      product.name = dto.name;
      // Regenerate slug when name changes
      product.slug = await this.ensureUniqueSlug(
        this.generateSlug(dto.name),
        tenantId,
        id,
      );
    }
    if (dto.description !== undefined) product.description = dto.description;
    if (dto.basePrice !== undefined) product.basePrice = dto.basePrice;
    if (dto.costPrice !== undefined) product.costPrice = dto.costPrice;
    if (dto.wholesalePrice !== undefined)
      product.wholesalePrice = dto.wholesalePrice ?? null;
    if (dto.minimumSalePrice !== undefined)
      product.minimumSalePrice = dto.minimumSalePrice ?? null;
    if (dto.gender !== undefined) product.gender = dto.gender;
    if (dto.categoryId !== undefined)
      product.categoryId = dto.categoryId as string;
    if (dto.brand !== undefined) {
      product.brand = dto.brand?.trim() || (null as never);
      await this.brandsService.ensure(dto.brand, tenantId);
    }
    if (dto.lote !== undefined)
      product.lote = dto.lote?.trim() || (null as never);
    if (dto.frascoVariantId !== undefined)
      product.frascoVariantId = dto.frascoVariantId || null;
    if (dto.status !== undefined) product.status = dto.status;
    if (dto.taxRate !== undefined) product.taxRate = dto.taxRate;
    if (dto.displayName !== undefined) product.displayName = dto.displayName;
    if (dto.imageUrl !== undefined) product.imageUrl = dto.imageUrl;
    if (dto.imageUrls !== undefined) product.imageUrls = dto.imageUrls;
    if (dto.videoUrl !== undefined) product.videoUrl = dto.videoUrl;
    if (dto.unitTracking !== undefined) product.unitTracking = dto.unitTracking;
    if (dto.isPublished !== undefined) {
      product.isPublished = dto.isPublished;
      product.publishedAt = dto.isPublished ? new Date() : null!;
    }
    // Override manual de punta: null vuelve al criterio automático.
    if (dto.isLeftover !== undefined) product.isLeftover = dto.isLeftover;

    await this.productRepository.save(product);

    // Sincronía con el frasco vinculado (solo tenants con auto-gestión): si
    // cambió el nombre, renombrar el frasco a "Frasco {nombre}"; si cambió la
    // foto, replicarla en el frasco.
    const nameChanged = dto.name !== undefined;
    const imageChanged =
      dto.imageUrl !== undefined || dto.imageUrls !== undefined;
    if (
      (nameChanged || imageChanged) &&
      product.frascoVariantId &&
      (await this.isFrascoAutoManaged(tenantId))
    ) {
      const frascoVariant = await this.variantRepository.findOne({
        where: { id: product.frascoVariantId, tenantId },
      });
      if (frascoVariant) {
        const frasco = await this.productRepository.findOne({
          where: { id: frascoVariant.productId, tenantId },
        });
        if (frasco) {
          let dirty = false;
          if (nameChanged) {
            const newName = `Frasco ${product.name}`;
            if (frasco.name !== newName) {
              frasco.name = newName;
              frasco.slug = await this.ensureUniqueSlug(
                this.generateSlug(newName),
                tenantId,
                frasco.id,
              );
              dirty = true;
            }
          }
          if (imageChanged) {
            frasco.imageUrls = product.imageUrls ?? [];
            frasco.imageUrl =
              product.imageUrls?.[0] ?? product.imageUrl ?? null!;
            dirty = true;
          }
          if (dirty) await this.productRepository.save(frasco);
        }
      }
    }

    // Handle variants update
    if (dto.variants) {
      const incomingIds = new Set(
        dto.variants.filter((v) => v.id).map((v) => v.id!),
      );

      // Remove variants not present in the payload
      const existingVariants = await this.variantRepository.find({
        where: { productId: id },
      });
      for (const ev of existingVariants) {
        if (!incomingIds.has(ev.id)) {
          try {
            await this.variantRepository.remove(ev);
          } catch (err: any) {
            if (err?.code === '23503') {
              ev.isActive = false;
              await this.variantRepository.save(ev);
            } else {
              throw err;
            }
          }
        }
      }

      for (const v of dto.variants) {
        if (v.id) {
          const existing = await this.variantRepository.findOne({
            where: { id: v.id, productId: id },
          });
          if (existing) {
            // Al cambiar talla/color hay que reapuntar la FK, no solo el texto:
            // si no, la variante quedaría vinculada al valor anterior.
            if (v.size !== undefined) {
              const size = await this.sizesService.ensure(v.size, tenantId);
              existing.sizeId = size?.id ?? null;
              existing.size = size?.name ?? '';
            }
            if (v.color !== undefined) {
              const color = await this.colorsService.ensure(v.color, tenantId);
              existing.colorId = color?.id ?? null;
              existing.color = color?.name ?? '';
            }
            if (v.priceOverride !== undefined)
              existing.priceOverride = v.priceOverride;
            if (v.isActive !== undefined) existing.isActive = v.isActive;
            if (v.size || v.color) {
              const baseSku = this.generateSku(
                product.skuPrefix,
                v.size || existing.sizeName,
                v.color || existing.colorName,
              );
              if (baseSku !== existing.sku) {
                existing.sku = await this.ensureUniqueSku(baseSku, tenantId);
              }
            }
            await this.variantRepository.save(existing);
          }
        } else {
          await this.createVariantFor(product, v, tenantId);
        }
      }
    }

    // Receta de esencias: si el payload la incluye, reemplaza la actual.
    if (dto.essences) {
      await this.recipeService.replaceRecipe(
        this.dataSource.manager,
        id,
        tenantId,
        dto.essences,
      );
    }
    // Relación inversa (esencia → productos que la usan).
    if (dto.usedInProducts) {
      await this.recipeService.replaceUsedIn(
        this.dataSource.manager,
        id,
        tenantId,
        dto.usedInProducts,
      );
    }

    return this.findOne(id, tenantId);
  }

  // Receta de esencias del producto (para el frontend).
  async getRecipe(id: string, tenantId: string): Promise<ProductEssence[]> {
    await this.findOne(id, tenantId); // valida existencia/tenant
    return this.recipeService.getRecipe(id, tenantId);
  }

  // Relación inversa: productos finales que usan esta esencia.
  async getUsedIn(
    id: string,
    tenantId: string,
  ): Promise<{ productId: string; gramsPerUnit: number }[]> {
    await this.findOne(id, tenantId);
    return this.recipeService.getUsedIn(id, tenantId);
  }

  async remove(id: string, tenantId: string): Promise<void> {
    const product = await this.findOne(id, tenantId);
    try {
      await this.productRepository.remove(product);
    } catch (error: any) {
      if (error?.code === '23503') {
        throw new ConflictException(
          'No se puede eliminar este producto porque tiene ventas, devoluciones u órdenes asociadas. Puedes desactivarlo en su lugar.',
        );
      }
      throw error;
    }
  }

  async publish(id: string, tenantId: string): Promise<Product> {
    const product = await this.findOne(id, tenantId);
    product.isPublished = true;
    product.publishedAt = new Date();
    await this.productRepository.save(product);
    return this.findOne(id, tenantId);
  }

  async unpublish(id: string, tenantId: string): Promise<Product> {
    const product = await this.findOne(id, tenantId);
    product.isPublished = false;
    product.publishedAt = null!;
    await this.productRepository.save(product);
    return this.findOne(id, tenantId);
  }

  async findVariant(
    variantId: string,
    tenantId: string,
  ): Promise<ProductVariant> {
    const variant = await this.variantRepository.findOne({
      where: { id: variantId },
      relations: ['product'],
    });
    if (!variant) {
      throw new NotFoundException('Variante no encontrada');
    }
    // Verify the variant's product belongs to this tenant
    if (variant.product.tenantId !== tenantId) {
      throw new NotFoundException('Variante no encontrada');
    }
    return variant;
  }

  async searchVariants(
    query: string,
    tenantId: string,
    opts?: {
      limit?: number;
      offset?: number;
      type?: string;
      sort?: string;
      warehouseId?: string;
    },
  ): Promise<ProductVariant[]> {
    // Límite configurable (para el catálogo del POS con "ver más"), con tope.
    const limit = Math.min(Math.max(Number(opts?.limit) || 20, 1), 200);
    const offset = Math.max(Number(opts?.offset) || 0, 0);

    const qb = this.variantRepository
      .createQueryBuilder('v')
      .leftJoinAndSelect('v.product', 'p')
      .leftJoin('p.category', 'c')
      .where('v.is_active = true')
      .andWhere('p.status = :status', { status: 'ACTIVE' })
      .andWhere('p.tenant_id = :tenantId', { tenantId })
      .andWhere(
        '(v.sku ILIKE :q OR v.barcode ILIKE :q OR p.name ILIKE :q OR p.brand ILIKE :q)',
        { q: `%${query}%` },
      );

    // Filtro por tipo de categoría (perfumería): STANDARD | ESSENCE | FRASCO.
    // "STANDARD" incluye productos sin categoría o con categoría sin tipo.
    if (opts?.type === 'STANDARD') {
      qb.andWhere("(c.type = 'STANDARD' OR c.type IS NULL)");
    } else if (opts?.type) {
      qb.andWhere('c.type = :type', { type: opts.type });
    }

    const stockQuantitySql = `(
      SELECT COALESCE(SUM(stock_sort.quantity), 0)
      FROM stock stock_sort
      WHERE stock_sort.variant_id = v.id
        AND stock_sort.tenant_id = :tenantId
        ${opts?.warehouseId ? 'AND stock_sort.warehouse_id = :sortWarehouseId' : ''}
    )`;
    if (opts?.warehouseId) {
      qb.setParameter('sortWarehouseId', opts.warehouseId);
    }
    qb.addSelect(stockQuantitySql, 'inventory_quantity');
    switch (opts?.sort) {
      case 'stock-asc':
        qb.orderBy('inventory_quantity', 'ASC');
        break;
      case 'name-desc':
        qb.orderBy('p.name', 'DESC');
        break;
      case 'name-asc':
        qb.orderBy('p.name', 'ASC');
        break;
      case 'stock-desc':
      default:
        qb.orderBy('inventory_quantity', 'DESC');
        break;
    }
    return qb.addOrderBy('v.id', 'ASC').limit(limit).offset(offset).getMany();
  }

  /**
   * Catálogo del POS paginado por PRODUCTO, no por variante.
   *
   * La búsqueda histórica devolvía una fila por talla/color. Además de repetir
   * tarjetas, el LIMIT podía cortar las variantes de una referencia entre dos
   * páginas. Aquí primero se pagina la referencia y después se cargan todas sus
   * variantes. También reconoce los códigos físicos de `stock_units` (cajas y
   * unidades), que antes solo funcionaban en el botón de escáner.
   */
  async searchPosCatalog(
    query: string,
    tenantId: string,
    opts?: {
      limit?: number;
      offset?: number;
      type?: string;
      sort?: string;
      warehouseId?: string;
    },
  ): Promise<{
    data: {
      id: string;
      name: string;
      skuPrefix: string;
      basePrice: number;
      wholesalePrice: number | null;
      minimumSalePrice: number | null;
      taxRate: number;
      imageUrl: string | null;
      categoryId: string | null;
      gender: string;
      totalStock: number;
      variants: {
        id: string;
        sku: string;
        size: string;
        color: string;
        barcode: string | null;
        priceOverride: number | null;
        availableStock: number;
        /** Pairs libres para vender por variante; no incluye cajas cerradas. */
        looseStock: number;
        /** Pairs que siguen dentro de cajas mixtas cerradas. */
        boxedStock: number;
        stocks: { warehouseId: string; quantity: number }[];
      }[];
      /** Pairs físicos dentro de cajas cerradas, no asignados a una talla. */
      boxedStock: number;
      closedBoxCount: number;
    }[];
    hasMore: boolean;
  }> {
    const limit = Math.min(Math.max(Number(opts?.limit) || 30, 1), 100);
    const offset = Math.max(Number(opts?.offset) || 0, 0);
    const cleanQuery = (query || '').trim();

    // El total se calcula en una subconsulta para no multiplicarlo por el JOIN
    // usado únicamente para buscar SKU/barcode de alguna variante.
    const stockQuantitySql = `(
      SELECT COALESCE(SUM(stock_sort.quantity), 0)
      FROM stock stock_sort
      INNER JOIN product_variants variant_sort
        ON variant_sort.id = stock_sort.variant_id
      WHERE variant_sort.product_id = p.id
        AND stock_sort.tenant_id = :tenantId
        ${opts?.warehouseId ? 'AND stock_sort.warehouse_id = :sortWarehouseId' : ''}
    )`;

    const qb = this.productRepository
      .createQueryBuilder('p')
      .innerJoin(
        'p.variants',
        'matched_variant',
        'matched_variant.is_active = true',
      )
      .leftJoin('p.category', 'category')
      .select('p.id', 'id')
      .addSelect('p.name', 'product_name')
      .addSelect(stockQuantitySql, 'inventory_quantity')
      .where('p.tenant_id = :tenantId', { tenantId })
      .andWhere('p.status = :status', { status: 'ACTIVE' })
      .distinct(true);

    if (opts?.warehouseId) {
      qb.setParameter('sortWarehouseId', opts.warehouseId);
    }
    if (opts?.type === 'STANDARD') {
      qb.andWhere("(category.type = 'STANDARD' OR category.type IS NULL)");
    } else if (opts?.type) {
      qb.andWhere('category.type = :type', { type: opts.type });
    }
    if (cleanQuery) {
      qb.andWhere(
        `(
          p.name ILIKE :query OR p.brand ILIKE :query OR
          p.sku_prefix ILIKE :query OR matched_variant.sku ILIKE :query OR
          matched_variant.barcode ILIKE :query OR EXISTS (
            SELECT 1 FROM stock_units physical_unit
            WHERE physical_unit.tenant_id = :tenantId
              AND physical_unit.product_id = p.id
              AND physical_unit.barcode ILIKE :query
          )
        )`,
        { query: `%${cleanQuery}%` },
      );
    }

    switch (opts?.sort) {
      case 'stock-asc':
        qb.orderBy('inventory_quantity', 'ASC');
        break;
      case 'name-desc':
        qb.orderBy('product_name', 'DESC');
        break;
      case 'name-asc':
        qb.orderBy('product_name', 'ASC');
        break;
      case 'stock-desc':
      default:
        qb.orderBy('inventory_quantity', 'DESC');
        break;
    }
    const raw = await qb
      .addOrderBy('p.id', 'ASC')
      .limit(limit + 1)
      .offset(offset)
      .getRawMany<{ id: string }>();
    const pageIds = raw.slice(0, limit).map((row) => row.id);
    if (pageIds.length === 0) return { data: [], hasMore: false };

    const products = await this.productRepository.find({
      where: { id: In(pageIds), tenantId },
      relations: ['variants', 'variants.sizeRef', 'variants.colorRef'],
    });
    const productById = new Map(
      products.map((product) => [product.id, product]),
    );
    const variants = products.flatMap((product) =>
      (product.variants ?? []).filter((variant) => variant.isActive),
    );
    const variantIds = variants.map((variant) => variant.id);
    const stocks = variantIds.length
      ? await this.stockRepository.find({
          where: {
            tenantId,
            variantId: In(variantIds),
            ...(opts?.warehouseId ? { warehouseId: opts.warehouseId } : {}),
          },
        })
      : [];
    const closedBoxes = variantIds.length
      ? await this.stockUnitRepository.find({
          where: {
            tenantId,
            variantId: In(variantIds),
            kind: StockUnitKind.BOX,
            status: StockUnitStatus.IN_STOCK,
            ...(opts?.warehouseId ? { warehouseId: opts.warehouseId } : {}),
          },
        })
      : [];
    const boxedByKey = new Map<string, number>();
    for (const box of closedBoxes) {
      const key = `${box.variantId}|${box.warehouseId}`;
      boxedByKey.set(key, (boxedByKey.get(key) ?? 0) + Number(box.quantity));
    }
    const stockByVariant = new Map<
      string,
      { warehouseId: string; quantity: number }[]
    >();
    for (const stock of stocks) {
      const rows = stockByVariant.get(stock.variantId) ?? [];
      rows.push({ warehouseId: stock.warehouseId, quantity: stock.quantity });
      stockByVariant.set(stock.variantId, rows);
    }

    const data = pageIds.flatMap((productId) => {
      const product = productById.get(productId);
      if (!product) return [];
      const productVariants = (product.variants ?? [])
        .filter((variant) => variant.isActive)
        .map((variant) => {
          const variantStocks = stockByVariant.get(variant.id) ?? [];
          const boxedStock = variantStocks.reduce(
            (sum, stock) =>
              sum + (boxedByKey.get(`${variant.id}|${stock.warehouseId}`) ?? 0),
            0,
          );
          const totalStock = variantStocks.reduce(
            (sum, stock) => sum + stock.quantity,
            0,
          );
          return {
            id: variant.id,
            sku: variant.sku,
            size: variant.sizeName,
            color: variant.colorName,
            barcode: variant.barcode ?? null,
            priceOverride:
              variant.priceOverride === null
                ? null
                : Number(variant.priceOverride),
            availableStock: Math.max(0, totalStock - boxedStock),
            looseStock: Math.max(0, totalStock - boxedStock),
            boxedStock,
            stocks: variantStocks.map((stock) => ({
              ...stock,
              quantity: Math.max(
                0,
                stock.quantity -
                  (boxedByKey.get(`${variant.id}|${stock.warehouseId}`) ?? 0),
              ),
            })),
          };
        });
      return [
        {
          id: product.id,
          name: product.name,
          skuPrefix: product.skuPrefix,
          basePrice: Number(product.basePrice),
          wholesalePrice:
            product.wholesalePrice === null
              ? null
              : Number(product.wholesalePrice),
          minimumSalePrice:
            product.minimumSalePrice === null
              ? null
              : Number(product.minimumSalePrice),
          taxRate: Number(product.taxRate),
          imageUrl: product.imageUrl ?? null,
          categoryId: product.categoryId ?? null,
          gender: product.gender,
          totalStock: productVariants.reduce((sum, variant) => sum + variant.availableStock, 0),
          boxedStock: productVariants.reduce((sum, variant) => sum + variant.boxedStock, 0),
          closedBoxCount: closedBoxes.filter((box) => box.productId === product.id).length,
          variants: productVariants,
        },
      ];
    });

    return { data, hasMore: raw.length > limit };
  }
}
