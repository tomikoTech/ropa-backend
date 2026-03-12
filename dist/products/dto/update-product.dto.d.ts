import { Gender } from '../../common/enums/gender.enum.js';
import { ProductStatus } from '../../common/enums/product-status.enum.js';
export declare class UpdateVariantDto {
    id?: string;
    size?: string;
    color?: string;
    priceOverride?: number | null;
    isActive?: boolean;
}
export declare class UpdateProductDto {
    name?: string;
    description?: string;
    basePrice?: number;
    costPrice?: number;
    gender?: Gender;
    categoryId?: string;
    status?: ProductStatus;
    taxRate?: number;
    displayName?: string;
    imageUrl?: string;
    imageUrls?: string[];
    isPublished?: boolean;
    variants?: UpdateVariantDto[];
}
