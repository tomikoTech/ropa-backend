"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProductsService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const product_entity_js_1 = require("./entities/product.entity.js");
const product_variant_entity_js_1 = require("./entities/product-variant.entity.js");
let ProductsService = class ProductsService {
    productRepository;
    variantRepository;
    constructor(productRepository, variantRepository) {
        this.productRepository = productRepository;
        this.variantRepository = variantRepository;
    }
    generateSkuPrefix(name) {
        return name
            .toUpperCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^A-Z0-9]/g, '')
            .slice(0, 6);
    }
    generateSku(prefix, size, color) {
        const parts = [prefix];
        if (size)
            parts.push(size.toUpperCase().slice(0, 3));
        if (color)
            parts.push(color.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').slice(0, 3));
        if (parts.length === 1)
            parts.push(this.generateBarcode().slice(-4));
        return parts.join('-');
    }
    generateBarcode() {
        const timestamp = Date.now().toString().slice(-8);
        const random = Math.floor(Math.random() * 10000)
            .toString()
            .padStart(4, '0');
        return `78${timestamp}${random}`;
    }
    generateSlug(name) {
        return name
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
    }
    async ensureUniqueSlug(slug, tenantId, excludeId) {
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
    async create(dto, tenantId) {
        let skuPrefix = this.generateSkuPrefix(dto.name);
        const existingPrefix = await this.productRepository.findOne({
            where: { skuPrefix, tenantId },
        });
        if (existingPrefix) {
            const count = await this.productRepository.count({ where: { tenantId } });
            skuPrefix = `${skuPrefix}${count}`;
        }
        const slug = await this.ensureUniqueSlug(this.generateSlug(dto.name), tenantId);
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
            imageUrl: dto.imageUrl,
            tenantId,
        });
        const saved = await this.productRepository.save(product);
        if (dto.variants && dto.variants.length > 0) {
            const variants = dto.variants.map((v) => {
                return this.variantRepository.create({
                    productId: saved.id,
                    sku: this.generateSku(skuPrefix, v.size, v.color),
                    size: v.size || '',
                    color: v.color || '',
                    barcode: this.generateBarcode(),
                    priceOverride: v.priceOverride || null,
                    tenantId,
                });
            });
            await this.variantRepository.save(variants);
        }
        return this.findOne(saved.id, tenantId);
    }
    async findAll(tenantId) {
        return this.productRepository.find({
            where: { tenantId },
            relations: ['category', 'variants'],
            order: { createdAt: 'DESC' },
        });
    }
    async findOne(id, tenantId) {
        const product = await this.productRepository.findOne({
            where: { id, tenantId },
            relations: ['category', 'variants'],
        });
        if (!product) {
            throw new common_1.NotFoundException('Producto no encontrado');
        }
        return product;
    }
    async update(id, dto, tenantId) {
        const product = await this.findOne(id, tenantId);
        if (dto.name !== undefined) {
            product.name = dto.name;
            product.slug = await this.ensureUniqueSlug(this.generateSlug(dto.name), tenantId, id);
        }
        if (dto.description !== undefined)
            product.description = dto.description;
        if (dto.basePrice !== undefined)
            product.basePrice = dto.basePrice;
        if (dto.costPrice !== undefined)
            product.costPrice = dto.costPrice;
        if (dto.gender !== undefined)
            product.gender = dto.gender;
        if (dto.categoryId !== undefined)
            product.categoryId = dto.categoryId;
        if (dto.status !== undefined)
            product.status = dto.status;
        if (dto.taxRate !== undefined)
            product.taxRate = dto.taxRate;
        if (dto.displayName !== undefined)
            product.displayName = dto.displayName;
        if (dto.imageUrl !== undefined)
            product.imageUrl = dto.imageUrl;
        if (dto.imageUrls !== undefined)
            product.imageUrls = dto.imageUrls;
        if (dto.isPublished !== undefined) {
            product.isPublished = dto.isPublished;
            product.publishedAt = dto.isPublished ? new Date() : null;
        }
        await this.productRepository.save(product);
        if (dto.variants) {
            for (const v of dto.variants) {
                if (v.id) {
                    const existing = await this.variantRepository.findOne({
                        where: { id: v.id, productId: id },
                    });
                    if (existing) {
                        if (v.size !== undefined)
                            existing.size = v.size;
                        if (v.color !== undefined)
                            existing.color = v.color;
                        if (v.priceOverride !== undefined)
                            existing.priceOverride = v.priceOverride;
                        if (v.isActive !== undefined)
                            existing.isActive = v.isActive;
                        if (v.size || v.color) {
                            existing.sku = this.generateSku(product.skuPrefix, v.size || existing.size, v.color || existing.color);
                        }
                        await this.variantRepository.save(existing);
                    }
                }
                else {
                    const newVariant = this.variantRepository.create({
                        productId: id,
                        sku: this.generateSku(product.skuPrefix, v.size, v.color),
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
    async remove(id, tenantId) {
        const product = await this.findOne(id, tenantId);
        await this.productRepository.remove(product);
    }
    async publish(id, tenantId) {
        const product = await this.findOne(id, tenantId);
        product.isPublished = true;
        product.publishedAt = new Date();
        await this.productRepository.save(product);
        return this.findOne(id, tenantId);
    }
    async unpublish(id, tenantId) {
        const product = await this.findOne(id, tenantId);
        product.isPublished = false;
        product.publishedAt = null;
        await this.productRepository.save(product);
        return this.findOne(id, tenantId);
    }
    async findVariant(variantId, tenantId) {
        const variant = await this.variantRepository.findOne({
            where: { id: variantId },
            relations: ['product'],
        });
        if (!variant) {
            throw new common_1.NotFoundException('Variante no encontrada');
        }
        if (variant.product.tenantId !== tenantId) {
            throw new common_1.NotFoundException('Variante no encontrada');
        }
        return variant;
    }
    async searchVariants(query, tenantId) {
        return this.variantRepository
            .createQueryBuilder('v')
            .leftJoinAndSelect('v.product', 'p')
            .where('v.is_active = true')
            .andWhere('p.status = :status', { status: 'ACTIVE' })
            .andWhere('p.tenant_id = :tenantId', { tenantId })
            .andWhere('(v.sku ILIKE :q OR v.barcode ILIKE :q OR p.name ILIKE :q)', { q: `%${query}%` })
            .limit(20)
            .getMany();
    }
};
exports.ProductsService = ProductsService;
exports.ProductsService = ProductsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(product_entity_js_1.Product)),
    __param(1, (0, typeorm_1.InjectRepository)(product_variant_entity_js_1.ProductVariant)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository])
], ProductsService);
//# sourceMappingURL=products.service.js.map