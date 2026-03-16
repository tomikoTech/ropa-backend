import { Sale } from './sale.entity.js';
import { PaymentMethod } from '../../common/enums/payment-method.enum.js';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';
export declare class Payment extends TenantAwareEntity {
    id: string;
    sale: Sale;
    saleId: string;
    method: PaymentMethod;
    amount: number;
    reference: string;
    receiptImageUrl: string;
    receivedAmount: number;
    changeAmount: number;
    createdAt: Date;
}
