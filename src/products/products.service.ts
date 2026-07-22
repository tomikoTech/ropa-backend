import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { RecipeService } from './services/recipe.service.js';
import { ProductEssence } from './entities/product-essence.entity.js';
import { Product } from './entities/product.entity.js';
import { ProductVariant } from './entities/product-variant.entity.js';
import { StoreSettings } from '../storefront/entities/store-settings.entity.js';
import { Category } from '../categories/entities/category.entity.js';
import { Warehouse } from '../inventory/entities/warehouse.entity.js';
import { Stock } from '../inventory/entities/stock.entity.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';

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
    @InjectRepository(ProductEssence)
    private readonly essenceRepository: Repository<ProductEssence>,
    private readonly recipeService: RecipeService,
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
    let skuPrefix = this.generateSkuPrefix(name);
    let n = 1;
    while (
      await this.productRepository.findOne({ where: { skuPrefix, tenantId } })
    ) {
      n += 1;
      skuPrefix = `${this.generateSkuPrefix(name)}${n}`;
    }
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

    const sku = await this.ensureUniqueSku(
      this.generateSku(skuPrefix, 'Unica', 'Unico'),
      tenantId,
    );
    const variant = this.variantRepository.create({
      productId: savedFrasco.id,
      sku,
      size: 'Única',
      color: 'Único',
      barcode: this.generateBarcode(),
      tenantId,
    });
    const savedVariant = await this.variantRepository.save(variant);

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

  private generateSkuPrefix(name: string): string {
    return name
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 6);
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
    let candidate = baseSku;
    let counter = 2;
    while (true) {
      const exists = await this.variantRepository.findOne({
        where: { sku: candidate, tenantId },
      });
      if (!exists) return candidate;
      candidate = `${baseSku}-${counter}`;
      counter++;
    }
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
    let skuPrefix = this.generateSkuPrefix(dto.name);

    // Ensure unique prefix within tenant
    const existingPrefix = await this.productRepository.findOne({
      where: { skuPrefix, tenantId },
    });
    if (existingPrefix) {
      const count = await this.productRepository.count({ where: { tenantId } });
      skuPrefix = `${skuPrefix}${count}`;
    }

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
      gender: dto.gender,
      categoryId: dto.categoryId,
      frascoVariantId: dto.frascoVariantId ?? null,
      taxRate: dto.taxRate ?? 19,
      imageUrl: dto.imageUrl || dto.imageUrls?.[0],
      imageUrls: dto.imageUrls ?? [],
      videoUrl: dto.videoUrl,
      tenantId,
    });

    const saved = await this.productRepository.save(product);

    // Create variants
    if (dto.variants && dto.variants.length > 0) {
      for (const v of dto.variants) {
        const sku = await this.ensureUniqueSku(
          this.generateSku(skuPrefix, v.size, v.color),
          tenantId,
        );
        const variant = this.variantRepository.create({
          productId: saved.id,
          sku,
          size: v.size || '',
          color: v.color || '',
          barcode: this.generateBarcode(),
          priceOverride: v.priceOverride || null,
          tenantId,
        });
        await this.variantRepository.save(variant);
      }
    }

    // Auto-crear frasco vinculado (perfumería): opt-in por producto y
    // gated por el flag del tenant.
    if (
      dto.autoCreateFrasco &&
      !dto.frascoVariantId &&
      (await this.isFrascoAutoManaged(tenantId))
    ) {
      const frascoVariantId = await this.createFrascoForProduct(saved, tenantId);
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

    return this.findOne(saved.id, tenantId);
  }

  async findAll(tenantId: string): Promise<Product[]> {
    return this.productRepository.find({
      where: { tenantId },
      relations: ['category', 'variants'],
      order: { createdAt: 'DESC' },
    });
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
    if (dto.gender !== undefined) product.gender = dto.gender;
    if (dto.categoryId !== undefined) product.categoryId = dto.categoryId as string;
    if (dto.frascoVariantId !== undefined)
      product.frascoVariantId = dto.frascoVariantId || null;
    if (dto.status !== undefined) product.status = dto.status;
    if (dto.taxRate !== undefined) product.taxRate = dto.taxRate;
    if (dto.displayName !== undefined) product.displayName = dto.displayName;
    if (dto.imageUrl !== undefined) product.imageUrl = dto.imageUrl;
    if (dto.imageUrls !== undefined) product.imageUrls = dto.imageUrls;
    if (dto.videoUrl !== undefined) product.videoUrl = dto.videoUrl;
    if (dto.isPublished !== undefined) {
      product.isPublished = dto.isPublished;
      product.publishedAt = dto.isPublished ? new Date() : null!;
    }

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
            if (v.size !== undefined) existing.size = v.size;
            if (v.color !== undefined) existing.color = v.color;
            if (v.priceOverride !== undefined)
              existing.priceOverride = v.priceOverride;
            if (v.isActive !== undefined) existing.isActive = v.isActive;
            if (v.size || v.color) {
              const baseSku = this.generateSku(
                product.skuPrefix,
                v.size || existing.size,
                v.color || existing.color,
              );
              if (baseSku !== existing.sku) {
                existing.sku = await this.ensureUniqueSku(baseSku, tenantId);
              }
            }
            await this.variantRepository.save(existing);
          }
        } else {
          const sku = await this.ensureUniqueSku(
            this.generateSku(product.skuPrefix, v.size, v.color),
            tenantId,
          );
          const newVariant = this.variantRepository.create({
            productId: id,
            sku,
            size: v.size || '',
            color: v.color || '',
            barcode: this.generateBarcode(),
            priceOverride: v.priceOverride || null,
            tenantId,
          });
          await this.variantRepository.save(newVariant);
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
    opts?: { limit?: number; offset?: number; type?: string },
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
      .andWhere('(v.sku ILIKE :q OR v.barcode ILIKE :q OR p.name ILIKE :q)', {
        q: `%${query}%`,
      });

    // Filtro por tipo de categoría (perfumería): STANDARD | ESSENCE | FRASCO.
    // "STANDARD" incluye productos sin categoría o con categoría sin tipo.
    if (opts?.type === 'STANDARD') {
      qb.andWhere("(c.type = 'STANDARD' OR c.type IS NULL)");
    } else if (opts?.type) {
      qb.andWhere('c.type = :type', { type: opts.type });
    }

    return qb
      .orderBy('p.name', 'ASC')
      .addOrderBy('v.id', 'ASC')
      .limit(limit)
      .offset(offset)
      .getMany();
  }
}
