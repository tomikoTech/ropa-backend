import { Repository } from 'typeorm';
import { Product } from './entities/product.entity.js';
import { ProductVariant } from './entities/product-variant.entity.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';
export declare class ProductsService {
    private readonly productRepository;
    private readonly variantRepository;
    constructor(productRepository: Repository<Product>, variantRepository: Repository<ProductVariant>);
    private generateSkuPrefix;
    private generateSku;
    private generateBarcode;
    create(dto: CreateProductDto, tenantId: string): Promise<Product>;
    findAll(tenantId: string): Promise<Product[]>;
    findOne(id: string, tenantId: string): Promise<Product>;
    update(id: string, dto: UpdateProductDto, tenantId: string): Promise<Product>;
    remove(id: string, tenantId: string): Promise<void>;
    findVariant(variantId: string, tenantId: string): Promise<ProductVariant>;
    searchVariants(query: string, tenantId: string): Promise<ProductVariant[]>;
}
