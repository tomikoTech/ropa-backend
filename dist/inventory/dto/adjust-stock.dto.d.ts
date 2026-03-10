import { MovementType } from '../../common/enums/movement-type.enum.js';
export declare class AdjustStockDto {
    variantId: string;
    warehouseId: string;
    quantity: number;
    movementType: MovementType;
    notes?: string;
}
