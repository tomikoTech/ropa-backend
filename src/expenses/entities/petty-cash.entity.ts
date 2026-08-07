import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Warehouse } from '../../inventory/entities/warehouse.entity.js';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';

/**
 * Caja menor de un punto: un fondo fijo del que salen los gastos menudos.
 *
 * El saldo no se guarda: se calcula como fondo + reposiciones − gastos, así
 * no puede quedar desincronizado de sus movimientos.
 */
@Entity('petty_cash')
export class PettyCash extends TenantAwareEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Warehouse, {
    nullable: true,
    eager: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'warehouse_id' })
  warehouse: Warehouse | null;

  @Column({ name: 'warehouse_id', type: 'uuid', nullable: true })
  warehouseId: string | null;

  @Column()
  name: string;

  /** Fondo asignado más las reposiciones que se le han hecho. */
  @Column({
    name: 'funded_amount',
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: 0,
  })
  fundedAmount: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
