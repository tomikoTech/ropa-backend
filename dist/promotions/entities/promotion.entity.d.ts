import { DiscountType } from '../../common/enums/discount-type.enum.js';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';
export declare class Promotion extends TenantAwareEntity {
    id: string;
    name: string;
    description: string;
    discountType: DiscountType;
    discountValue: number;
    applicableTo: string;
    applicableId: string;
    startDate: Date;
    endDate: Date;
    maxUses: number;
    currentUses: number;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}
