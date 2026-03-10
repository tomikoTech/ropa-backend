import { Repository } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity.js';
export declare class AuditService {
    private readonly auditLogRepository;
    constructor(auditLogRepository: Repository<AuditLog>);
    log(data: {
        userId?: string;
        action: string;
        entityType: string;
        entityId?: string;
        oldValues?: Record<string, unknown>;
        newValues?: Record<string, unknown>;
        ip?: string;
        tenantId?: string;
    }): Promise<void>;
    findAll(filters: {
        entityType?: string;
        userId?: string;
        action?: string;
        from?: string;
        to?: string;
        limit?: number;
    } | undefined, tenantId: string): Promise<AuditLog[]>;
}
