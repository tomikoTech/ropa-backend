import { PaymentMethod } from '../../common/enums/payment-method.enum.js';
export declare class RecordArPaymentDto {
    amount: number;
    method: PaymentMethod;
    reference?: string;
    receiptImageUrl?: string;
    notes?: string;
}
