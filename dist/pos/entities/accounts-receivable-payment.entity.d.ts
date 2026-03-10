import { AccountsReceivable } from './accounts-receivable.entity.js';
import { PaymentMethod } from '../../common/enums/payment-method.enum.js';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';
export declare class AccountsReceivablePayment extends TenantAwareEntity {
    id: string;
    accountReceivable: AccountsReceivable;
    accountReceivableId: string;
    amount: number;
    method: PaymentMethod;
    reference: string;
    receiptImageUrl: string;
    notes: string;
    createdAt: Date;
}
