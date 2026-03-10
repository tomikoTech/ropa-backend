import { Sale } from '../../pos/entities/sale.entity.js';
import { Client } from '../../clients/entities/client.entity.js';
import { User } from '../../users/entities/user.entity.js';
import { ReturnItem } from './return-item.entity.js';
import { CreditNote } from './credit-note.entity.js';
import { ReturnStatus } from '../../common/enums/return-status.enum.js';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';
export declare class Return extends TenantAwareEntity {
    id: string;
    returnNumber: string;
    sale: Sale;
    saleId: string;
    client: Client;
    clientId: string;
    user: User;
    userId: string;
    reason: string;
    status: ReturnStatus;
    refundAmount: number;
    items: ReturnItem[];
    creditNotes: CreditNote[];
    createdAt: Date;
    updatedAt: Date;
}
