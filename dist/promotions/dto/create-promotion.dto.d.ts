import { DiscountType } from '../../common/enums/discount-type.enum.js';
export declare class CreatePromotionDto {
    name: string;
    description?: string;
    discountType: DiscountType;
    discountValue: number;
    applicableTo?: string;
    applicableId?: string;
    startDate: string;
    endDate: string;
    maxUses?: number;
}
