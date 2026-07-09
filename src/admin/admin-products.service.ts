import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StoreSettings } from '../storefront/entities/store-settings.entity.js';
import { Product } from '../products/entities/product.entity.js';
import { Category } from '../categories/entities/category.entity.js';
import { ProductsService } from '../products/products.service.js';
import { CategoriesService } from '../categories/categories.service.js';
import { SupabaseStorageService } from '../common/services/supabase-storage.service.js';
import { Gender } from '../common/enums/gender.enum.js';
import { CreateAdminProductDto } from './dto/create-admin-product.dto.js';

@Injectable()
export class AdminProductsService {
  constructor(
    @InjectRepository(StoreSettings)
    private readonly settingsRepo: Repository<StoreSettings>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,
    private readonly productsService: ProductsService,
    private readonly categoriesService: CategoriesService,
    private readonly storage: SupabaseStorageService,
  ) {}

  private async resolveTenantId(tenantSlug: string): Promise<string> {
    const settings = await this.settingsRepo.findOne({
      where: { storeSlug: tenantSlug },
    });
    if (!settings) {
      throw new NotFoundException('Tienda no encontrada');
    }
    return settings.tenantId;
  }

  /** Resuelve una categoría por nombre (case-insensitive) o la crea. */
  private async resolveCategoryId(
    name: string,
    tenantId: string,
  ): Promise<string | undefined> {
    const trimmed = name.trim();
    if (!trimmed) return undefined;

    const existing = await this.categoryRepo
      .createQueryBuilder('c')
      .where('c.tenant_id = :tenantId', { tenantId })
      .andWhere('LOWER(c.name) = LOWER(:name)', { name: trimmed })
      .getOne();
    if (existing) return existing.id;

    const created = await this.categoriesService.create(
      { name: trimmed, isActive: true, isPublished: true },
      tenantId,
    );
    return created.id;
  }

  private computeAvailable(p: {
    isPublished: boolean;
    isAvailable: boolean;
  }): boolean {
    return p.isPublished && p.isAvailable;
  }

  /** Normaliza el género recibido (acepta alias DAMA→MUJER). Default UNISEX. */
  private normalizeGender(raw?: string): Gender {
    switch ((raw ?? '').trim().toUpperCase()) {
      case 'HOMBRE':
        return Gender.HOMBRE;
      case 'MUJER':
      case 'DAMA':
        return Gender.MUJER;
      case 'UNISEX':
        return Gender.UNISEX;
      default:
        return Gender.UNISEX;
    }
  }

  async createProduct(tenantSlug: string, dto: CreateAdminProductDto) {
    const tenantId = await this.resolveTenantId(tenantSlug);

    const categoryId = dto.category
      ? await this.resolveCategoryId(dto.category, tenantId)
      : undefined;

    // Subir imágenes (1..N) al bucket; la primera queda como principal.
    const imageUrls: string[] = [];
    for (const img of dto.images_base64 ?? []) {
      const url = await this.storage.uploadBase64Image(
        img.data,
        img.mime ?? 'image/jpeg',
      );
      imageUrls.push(url);
    }

    // Al menos una variante para que el producto sea vendible/tenga SKU.
    const variants =
      dto.variants && dto.variants.length > 0
        ? dto.variants.map((v) => ({
            size: v.size ?? '',
            color: v.color ?? '',
          }))
        : [{ size: '', color: '' }];

    const created = await this.productsService.create(
      {
        name: dto.name,
        description: dto.description,
        basePrice: dto.basePrice,
        gender: this.normalizeGender(dto.gender),
        categoryId,
        imageUrls,
        variants,
      },
      tenantId,
    );

    // Publicar por defecto (a menos que isPublished === false).
    const shouldPublish = dto.isPublished !== false;
    if (shouldPublish) {
      await this.productsService.publish(created.id, tenantId);
    }

    // Disponible al crear (columna default true). Recargamos estado real.
    const product = await this.productRepo.findOne({
      where: { id: created.id, tenantId },
    });

    return {
      id: created.id,
      slug: created.slug,
      name: created.name,
      imageUrls: product?.imageUrls ?? imageUrls,
      available: product ? this.computeAvailable(product) : shouldPublish,
    };
  }

  async setAvailability(
    tenantSlug: string,
    identifier: { id?: string; slug?: string },
    available: boolean,
  ) {
    const tenantId = await this.resolveTenantId(tenantSlug);

    const where = identifier.id
      ? { id: identifier.id, tenantId }
      : { slug: identifier.slug, tenantId };
    const product = await this.productRepo.findOne({ where });
    if (!product) {
      throw new NotFoundException('Producto no encontrado');
    }

    product.isAvailable = available;
    await this.productRepo.save(product);

    return {
      id: product.id,
      available: this.computeAvailable(product),
    };
  }
}
