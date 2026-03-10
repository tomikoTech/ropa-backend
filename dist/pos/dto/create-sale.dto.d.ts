import { PaymentMethod } from '../../common/enums/payment-method.enum.js';
export declare class SaleItemDto {
    variantId: string;
    quantity: number;
    discountPercent?: number;
}
export declare class PaymentDto {
    method: PaymentMethod;
    amount: number;
    reference?: string;
    receivedAmount?: number;
}
export declare class CreateSaleDto {
    clientId?: string;
    warehouseId: string;
    items: SaleItemDto[];
    payments: PaymentDto[];
    notes?: string;
    creditDueDate?: string;
    creditNotes?: string;
}
