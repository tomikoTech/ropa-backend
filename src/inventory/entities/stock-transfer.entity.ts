import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';
import { ProductVariant } from '../../products/entities/product-variant.entity.js';
import { Warehouse } from './warehouse.entity.js';

// Tipo de remisión: traslado permanente (con confirmación) o préstamo temporal.
export type StockTransferType = 'TRANSFER' | 'LOAN';
// Estados: PENDING (en tránsito / préstamo abierto), RECEIVED (traslado recibido),
// RETURNED (préstamo devuelto), CANCELLED (traslado anulado, devuelto a origen).
export type StockTransferStatus =
  | 'PENDING'
  | 'RECEIVED'
  | 'RETURNED'
  | 'CANCELLED';

@Entity('stock_transfers')
export class StockTransfer extends TenantAwareEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', default: 'TRANSFER' })
  type: StockTransferType;

  @Column({ type: 'varchar', default: 'PENDING' })
  status: StockTransferStatus;

  @ManyToOne(() => ProductVariant)
  @JoinColumn({ name: 'variant_id' })
  variant: ProductVariant;

  @Index()
  @Column({ name: 'variant_id', type: 'uuid' })
  variantId: string;

  @ManyToOne(() => Warehouse)
  @JoinColumn({ name: 'from_warehouse_id' })
  fromWarehouse: Warehouse;

  @Column({ name: 'from_warehouse_id', type: 'uuid' })
  fromWarehouseId: string;

  @ManyToOne(() => Warehouse)
  @JoinColumn({ name: 'to_warehouse_id' })
  toWarehouse: Warehouse;

  @Column({ name: 'to_warehouse_id', type: 'uuid' })
  toWarehouseId: string;

  @Column({ type: 'int' })
  quantity: number;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdById?: string | null;

  @Column({ name: 'received_by', type: 'uuid', nullable: true })
  receivedById?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'received_at', type: 'timestamptz', nullable: true })
  receivedAt?: Date | null;
}
