import { Sale } from './sale.entity.js';
import { ProductVariant } from '../../products/entities/product-variant.entity.js';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';
export declare class SaleItem extends TenantAwareEntity {
    id: string;
    sale: Sale;
    saleId: string;
    variant: ProductVariant;
    variantId: string;
    productName: string;
    variantSku: string;
    variantSize: string;
    variantColor: string;
    quantity: number;
    unitPrice: number;
    discountPercent: number;
    taxRate: number;
    taxAmount: number;
    lineTotal: number;
    createdAt: Date;
}
