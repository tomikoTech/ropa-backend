import { PurchaseOrder } from './purchase-order.entity.js';
import { ProductVariant } from '../../products/entities/product-variant.entity.js';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';
export declare class PurchaseOrderItem extends TenantAwareEntity {
    id: string;
    purchaseOrder: PurchaseOrder;
    purchaseOrderId: string;
    variant: ProductVariant;
    variantId: string;
    quantityOrdered: number;
    quantityReceived: number;
    unitCost: number;
}
