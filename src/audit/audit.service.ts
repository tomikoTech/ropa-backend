import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity.js';
import { Paginated } from '../common/types/paginated.js';
import { armarPaginado, resolverPagina } from '../common/utils/paginacion.js';

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

  async findAll(
    filters:
      | {
          entityType?: string;
          userId?: string;
          action?: string;
          from?: string;
          to?: string;
          limit?: number;
        }
      | undefined,
    tenantId: string,
  ): Promise<AuditLog[]> {
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

  /**
   * Bitácora por página, con los filtros hechos en el servidor.
   *
   * `audit_logs` es la tabla más grande de la base —el 81%—, así que este es el
   * listado que más daño hacía trayéndose todo: la pantalla pedía las últimas
   * 200 filas sin decir cuántas había ni dejar avanzar más atrás. Ahora pagina
   * de verdad (con su total) y por fin aplica el filtro de fechas, que antes se
   * recibía y no se usaba.
   */
  async findAllPaginado(
    tenantId: string,
    opts: {
      page?: string | number;
      limit?: string | number;
      entityType?: string;
      userId?: string;
      action?: string;
      from?: string;
      to?: string;
    },
  ): Promise<Paginated<AuditLog>> {
    const pagina = resolverPagina(opts, { limitDefault: 50, limitMax: 200 });

    const qb = this.auditLogRepository
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.user', 'u')
      .where('a.tenantId = :tenantId', { tenantId });

    if (opts.entityType) qb.andWhere('a.entity_type = :et', { et: opts.entityType });
    if (opts.userId) qb.andWhere('a.user_id = :uid', { uid: opts.userId });
    if (opts.action) qb.andWhere('a.action = :ac', { ac: opts.action });
    if (opts.from) qb.andWhere('a.created_at >= :from', { from: opts.from });
    if (opts.to) qb.andWhere('a.created_at <= :to', { to: opts.to });

    const [data, total] = await qb
      .orderBy('a.created_at', 'DESC')
      .addOrderBy('a.id', 'DESC')
      .offset(pagina.offset)
      .limit(pagina.limit)
      .getManyAndCount();

    return armarPaginado(data, total, pagina);
  }
}
