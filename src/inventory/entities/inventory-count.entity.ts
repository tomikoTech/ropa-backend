import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Warehouse } from './warehouse.entity.js';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';

export enum InventoryCountStatus {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
}

/**
 * Conteo físico de inventario: se abre una ventana, se escanea lo que hay y
 * al cerrarla se comparan las cantidades contadas contra las del sistema.
 *
 * Las diferencias (las "novedades" del sistema anterior) se calculan al
 * cerrar; no se guardan aparte para que no puedan contradecir al conteo.
 */
@Entity('inventory_counts')
export class InventoryCount extends TenantAwareEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'count_number' })
  countNumber: string;

  @ManyToOne(() => Warehouse, { eager: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'warehouse_id' })
  warehouse: Warehouse;

  @Column({ name: 'warehouse_id' })
  warehouseId: string;

  @Column({
    type: 'enum',
    enum: InventoryCountStatus,
    default: InventoryCountStatus.OPEN,
  })
  status: InventoryCountStatus;

  @Column({ name: 'started_at', type: 'timestamptz' })
  startedAt: Date;

  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdById: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
