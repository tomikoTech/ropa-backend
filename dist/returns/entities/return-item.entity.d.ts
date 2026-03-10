import { Return } from './return.entity.js';
import { SaleItem } from '../../pos/entities/sale-item.entity.js';
import { ProductVariant } from '../../products/entities/product-variant.entity.js';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';
export declare class ReturnItem extends TenantAwareEntity {
    id: string;
    return: Return;
    returnId: string;
    saleItem: SaleItem;
    saleItemId: string;
    variant: ProductVariant;
    variantId: string;
    quantity: number;
    unitPrice: number;
}
