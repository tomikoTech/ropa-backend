import { Product } from './product.entity.js';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';
export declare class ProductVariant extends TenantAwareEntity {
    id: string;
    product: Product;
    productId: string;
    sku: string;
    size: string;
    color: string;
    barcode: string;
    priceOverride: number | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}
