import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';
import { Warehouse } from '../../inventory/entities/warehouse.entity.js';
import { InternalRequestItem } from './internal-request-item.entity.js';

export enum InternalRequestStatus {
  CREATED = 'CREATED',
  PREPARED = 'PREPARED',
  REMITTED = 'REMITTED',
  RETURNED = 'RETURNED',
  CANCELLED = 'CANCELLED',
}

@Entity('internal_requests')
@Unique(['tenantId', 'requestNumber'])
export class InternalRequest extends TenantAwareEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'request_number' }) requestNumber: string;
  @Column({ type: 'varchar', default: InternalRequestStatus.CREATED })
  status: InternalRequestStatus;

  @ManyToOne(() => Warehouse, { eager: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'destination_warehouse_id' })
  destinationWarehouse: Warehouse;
  @Column({ name: 'destination_warehouse_id', type: 'uuid' })
  destinationWarehouseId: string;

  @ManyToOne(() => Warehouse, {
    eager: true,
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'source_warehouse_id' })
  sourceWarehouse: Warehouse | null;
  @Column({ name: 'source_warehouse_id', type: 'uuid', nullable: true })
  sourceWarehouseId: string | null;

  @OneToMany(() => InternalRequestItem, (item) => item.request, { eager: true })
  items: InternalRequestItem[];
  @Column({ type: 'text', nullable: true }) notes: string | null;

  /**
   * La pidió el sistema, no una persona.
   *
   * Sirve para dos cosas: agrupar en una sola solicitud todo lo que un local
   * se va quedando sin tener —si no, cinco ventas dejan cinco solicitudes— y
   * para que quien la reciba sepa que nadie la escribió a mano.
   */
  @Column({ name: 'origen_automatico', type: 'boolean', default: false })
  origenAutomatico: boolean;
  @Column({ name: 'created_by', type: 'uuid', nullable: true }) createdById:
    | string
    | null;
  @Column({ name: 'prepared_by', type: 'uuid', nullable: true }) preparedById:
    | string
    | null;
  @Column({ name: 'prepared_at', type: 'timestamptz', nullable: true })
  preparedAt: Date | null;
  @Column({ name: 'remitted_at', type: 'timestamptz', nullable: true })
  remittedAt: Date | null;
  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt: Date | null;
  @Column({ name: 'printed_at', type: 'timestamptz', nullable: true })
  printedAt: Date | null;
  @Column({ name: 'print_count', type: 'int', default: 0 }) printCount: number;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
