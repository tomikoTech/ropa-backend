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
// RETURNED (préstamo devuelto o traslado devuelto entero), CANCELLED (lo anuló
// el origen), REJECTED (el destino no lo aceptó).
//
// CANCELLED y REJECTED mueven el stock igual —vuelve al origen— pero no
// significan lo mismo, y el historial tiene que poder distinguirlos: uno es que
// nos arrepentimos, el otro es que la mercancía llegó mal o no llegó.
export type StockTransferStatus =
  | 'PENDING'
  | 'RECEIVED'
  | 'RETURNED'
  | 'CANCELLED'
  | 'REJECTED';

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

  // Por qué se rechazó, se canceló o se devolvió. Lo escribe una persona y es
  // lo primero que se busca al revisar el historial meses después.
  @Column({ type: 'text', nullable: true })
  reason?: string | null;

  // Quién le puso punto final (rechazo, cancelación o devolución) y cuándo.
  @Column({ name: 'closed_by', type: 'uuid', nullable: true })
  closedById?: string | null;

  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt?: Date | null;

  // Esta remisión es la vuelta de otra. Sin el vínculo, una devolución parecía
  // un traslado cualquiera en sentido contrario y no había forma de saber que
  // esos pares eran los mismos que se habían mandado.
  @Index()
  @Column({ name: 'return_of_transfer_id', type: 'uuid', nullable: true })
  returnOfTransferId?: string | null;

  @ManyToOne(() => StockTransfer, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'return_of_transfer_id' })
  returnOfTransfer?: StockTransfer | null;

  // Cuánto de este traslado ya se devolvió. Se devuelve por partes porque así
  // pasa: se mandaron seis, se vendieron cuatro, regresan dos.
  @Column({ name: 'returned_quantity', type: 'int', default: 0 })
  returnedQuantity: number;
}
