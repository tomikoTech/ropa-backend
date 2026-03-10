import { AuditService } from './audit.service.js';
export declare class AuditController {
    private readonly auditService;
    constructor(auditService: AuditService);
    findAll(tenantId: string, entityType?: string, userId?: string, action?: string, from?: string, to?: string, limit?: string): Promise<import("./entities/audit-log.entity.js").AuditLog[]>;
}
