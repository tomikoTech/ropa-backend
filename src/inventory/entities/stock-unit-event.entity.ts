import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';
import { User } from '../../users/entities/user.entity.js';
import { StockUnit, StockUnitStatus } from './stock-unit.entity.js';

export enum StockUnitEventType {
  RECEIVED = 'RECEIVED',
  CONTENT_UPDATED = 'CONTENT_UPDATED',
  PRINTED = 'PRINTED',
  SPLIT = 'SPLIT',
  CREATED_FROM_BOX = 'CREATED_FROM_BOX',
  SOLD = 'SOLD',
  CONSIGNED = 'CONSIGNED',
  RETURNED = 'RETURNED',
  WRITTEN_OFF = 'WRITTEN_OFF',
  TRANSFERRED = 'TRANSFERRED',
  IMPORTED = 'IMPORTED',
}

/** Historial append-only del código físico. Nunca se edita ni se elimina. */
@Entity('stock_unit_events')
@Index(['tenantId', 'stockUnitId', 'createdAt'])
// Anular o editar una factura pregunta por aquí: qué bultos movió ese documento.
@Index(['tenantId', 'referenceType', 'referenceId'])
export class StockUnitEvent extends TenantAwareEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => StockUnit, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'stock_unit_id' })
  stockUnit: StockUnit;

  @Column({ name: 'stock_unit_id', type: 'uuid' })
  stockUnitId: string;

  @Column({ name: 'event_type', type: 'enum', enum: StockUnitEventType })
  eventType: StockUnitEventType;

  @Column({ name: 'from_status', type: 'varchar', nullable: true })
  fromStatus: StockUnitStatus | null;

  @Column({ name: 'to_status', type: 'varchar', nullable: true })
  toStatus: StockUnitStatus | null;

  @Column({ name: 'reference_type', type: 'varchar', nullable: true })
  referenceType: string | null;

  @Column({ name: 'reference_id', type: 'uuid', nullable: true })
  referenceId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user: User | null;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
