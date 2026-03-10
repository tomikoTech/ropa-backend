import { ProductVariant } from '../../products/entities/product-variant.entity.js';
import { Warehouse } from './warehouse.entity.js';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';
export declare class Stock extends TenantAwareEntity {
    id: string;
    variant: ProductVariant;
    variantId: string;
    warehouse: Warehouse;
    warehouseId: string;
    quantity: number;
    minStock: number;
    updatedAt: Date;
}
