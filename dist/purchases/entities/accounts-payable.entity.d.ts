import { PurchaseOrder } from './purchase-order.entity.js';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';
export declare class AccountsPayable extends TenantAwareEntity {
    id: string;
    purchaseOrder: PurchaseOrder;
    purchaseOrderId: string;
    amount: number;
    dueDate: Date;
    isPaid: boolean;
    paidAt: Date;
    notes: string;
    receiptImageUrl: string;
    createdAt: Date;
    updatedAt: Date;
}
