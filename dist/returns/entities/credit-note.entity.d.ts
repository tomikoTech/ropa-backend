import { Return } from './return.entity.js';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';
export declare class CreditNote extends TenantAwareEntity {
    id: string;
    creditNoteNumber: string;
    return: Return;
    returnId: string;
    amount: number;
    isApplied: boolean;
    notes: string;
    createdAt: Date;
}
