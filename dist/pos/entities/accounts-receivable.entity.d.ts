import { Sale } from './sale.entity.js';
import { Client } from '../../clients/entities/client.entity.js';
import { AccountsReceivablePayment } from './accounts-receivable-payment.entity.js';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';
export declare class AccountsReceivable extends TenantAwareEntity {
    id: string;
    sale: Sale;
    saleId: string;
    client: Client;
    clientId: string;
    totalAmount: number;
    paidAmount: number;
    dueDate: Date;
    isFullyPaid: boolean;
    fullyPaidAt: Date;
    notes: string;
    payments: AccountsReceivablePayment[];
    createdAt: Date;
    updatedAt: Date;
}
