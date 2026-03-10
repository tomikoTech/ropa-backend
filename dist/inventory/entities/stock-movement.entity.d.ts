import { ProductVariant } from '../../products/entities/product-variant.entity.js';
import { Warehouse } from './warehouse.entity.js';
import { User } from '../../users/entities/user.entity.js';
import { MovementType } from '../../common/enums/movement-type.enum.js';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';
export declare class StockMovement extends TenantAwareEntity {
    id: string;
    variant: ProductVariant;
    variantId: string;
    warehouse: Warehouse;
    warehouseId: string;
    movementType: MovementType;
    quantity: number;
    referenceType: string;
    referenceId: string;
    notes: string;
    createdBy: User;
    createdById: string;
    createdAt: Date;
}
