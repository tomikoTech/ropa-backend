import { Category } from '../../categories/entities/category.entity.js';
import { ProductVariant } from './product-variant.entity.js';
import { Gender } from '../../common/enums/gender.enum.js';
import { ProductStatus } from '../../common/enums/product-status.enum.js';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';
export declare class Product extends TenantAwareEntity {
    id: string;
    name: string;
    skuPrefix: string;
    slug: string;
    description: string;
    basePrice: number;
    costPrice: number;
    gender: Gender;
    category: Category;
    categoryId: string;
    status: ProductStatus;
    taxRate: number;
    displayName: string;
    imageUrl: string;
    imageUrls: string[];
    isPublished: boolean;
    publishedAt: Date;
    variants: ProductVariant[];
    createdAt: Date;
    updatedAt: Date;
}
