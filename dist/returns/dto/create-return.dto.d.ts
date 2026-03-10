export declare class ReturnItemDto {
    saleItemId: string;
    quantity: number;
}
export declare class CreateReturnDto {
    saleId: string;
    reason: string;
    items: ReturnItemDto[];
}
