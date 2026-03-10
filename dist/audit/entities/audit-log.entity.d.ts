import { User } from '../../users/entities/user.entity.js';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';
export declare class AuditLog extends TenantAwareEntity {
    id: string;
    user: User;
    userId: string;
    action: string;
    entityType: string;
    entityId: string;
    oldValues: Record<string, unknown>;
    newValues: Record<string, unknown>;
    ip: string;
    createdAt: Date;
}
