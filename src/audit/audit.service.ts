import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity.js';

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
  ) {}

  async log(data: {
    userId?: string;
    action: string;
    entityType: string;
    entityId?: string;
    oldValues?: Record<string, unknown>;
    newValues?: Record<string, unknown>;
    ip?: string;
    tenantId?: string;
  }): Promise<void> {
    const log = this.auditLogRepository.create(data);
    await this.auditLogRepository.save(log);
  }

  async findAll(filters: {
    entityType?: string;
    userId?: string;
    action?: string;
    from?: string;
    to?: string;
    limit?: number;
  } | undefined, tenantId: string): Promise<AuditLog[]> {
    const where: Record<string, unknown> = { tenantId };
    if (filters?.entityType) where.entityType = filters.entityType;
    if (filters?.userId) where.userId = filters.userId;
    if (filters?.action) where.action = filters.action;

    return this.auditLogRepository.find({
      where,
      relations: ['user'],
      order: { createdAt: 'DESC' },
      take: filters?.limit || 200,
    });
  }
}
