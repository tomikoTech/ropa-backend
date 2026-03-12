import { Gender } from '../../common/enums/gender.enum.js';
export declare class CreateVariantDto {
    size?: string;
    color?: string;
    priceOverride?: number;
}
export declare class CreateProductDto {
    name: string;
    description?: string;
    basePrice: number;
    costPrice?: number;
    gender?: Gender;
    categoryId?: string;
    taxRate?: number;
    displayName?: string;
    imageUrl?: string;
    variants: CreateVariantDto[];
}
