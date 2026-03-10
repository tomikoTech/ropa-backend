import { Supplier } from '../../suppliers/entities/supplier.entity.js';
import { Warehouse } from '../../inventory/entities/warehouse.entity.js';
import { User } from '../../users/entities/user.entity.js';
import { PurchaseOrderItem } from './purchase-order-item.entity.js';
import { AccountsPayable } from './accounts-payable.entity.js';
import { PurchaseOrderStatus } from '../../common/enums/purchase-order-status.enum.js';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';
export declare class PurchaseOrder extends TenantAwareEntity {
    id: string;
    orderNumber: string;
    supplier: Supplier;
    supplierId: string;
    warehouse: Warehouse;
    warehouseId: string;
    createdBy: User;
    createdById: string;
    status: PurchaseOrderStatus;
    total: number;
    notes: string;
    items: PurchaseOrderItem[];
    accountsPayable: AccountsPayable[];
    createdAt: Date;
    updatedAt: Date;
}
