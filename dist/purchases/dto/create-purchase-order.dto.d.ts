export declare class PurchaseOrderItemDto {
    variantId: string;
    quantityOrdered: number;
    unitCost: number;
}
export declare class CreatePurchaseOrderDto {
    supplierId: string;
    warehouseId: string;
    items: PurchaseOrderItemDto[];
    notes?: string;
    paymentDueDate?: string;
}
