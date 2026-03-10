import { ProductsService } from './products.service.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';
export declare class ProductsController {
    private readonly productsService;
    constructor(productsService: ProductsService);
    create(dto: CreateProductDto, tenantId: string): Promise<import("./entities/product.entity.js").Product>;
    findAll(tenantId: string): Promise<import("./entities/product.entity.js").Product[]>;
    searchVariants(query: string, tenantId: string): Promise<import("./entities/product-variant.entity.js").ProductVariant[]>;
    findOne(id: string, tenantId: string): Promise<import("./entities/product.entity.js").Product>;
    update(id: string, dto: UpdateProductDto, tenantId: string): Promise<import("./entities/product.entity.js").Product>;
    remove(id: string, tenantId: string): Promise<void>;
    findVariant(variantId: string, tenantId: string): Promise<import("./entities/product-variant.entity.js").ProductVariant>;
}
