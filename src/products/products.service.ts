import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from './entities/product.entity.js';
import { ProductVariant } from './entities/product-variant.entity.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(ProductVariant)
    private readonly variantRepository: Repository<ProductVariant>,
  ) {}

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

    // Handle variants update
    if (dto.variants) {
      for (const v of dto.variants) {
        if (v.id) {
          // Update existing — product already verified for tenant
          const existing = await this.variantRepository.findOne({
            where: { id: v.id, productId: id },
          });
          if (existing) {
            if (v.size !== undefined) existing.size = v.size;
            if (v.color !== undefined) existing.color = v.color;
            if (v.priceOverride !== undefined)
              existing.priceOverride = v.priceOverride;
            if (v.isActive !== undefined) existing.isActive = v.isActive;
            // Regenerate SKU if size or color changed
            if (v.size || v.color) {
              const baseSku = this.generateSku(
                product.skuPrefix,
                v.size || existing.size,
                v.color || existing.color,
              );
              // Only change if different from current, and ensure unique
              if (baseSku !== existing.sku) {
                existing.sku = await this.ensureUniqueSku(baseSku, tenantId);
              }
            }
            await this.variantRepository.save(existing);
          }
        } else {
          // Create new variant
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

    return this.findOne(id, tenantId);
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
  ): Promise<ProductVariant[]> {
    return this.variantRepository
      .createQueryBuilder('v')
      .leftJoinAndSelect('v.product', 'p')
      .where('v.is_active = true')
      .andWhere('p.status = :status', { status: 'ACTIVE' })
      .andWhere('p.tenant_id = :tenantId', { tenantId })
      .andWhere('(v.sku ILIKE :q OR v.barcode ILIKE :q OR p.name ILIKE :q)', {
        q: `%${query}%`,
      })
      .limit(20)
      .getMany();
  }
}
