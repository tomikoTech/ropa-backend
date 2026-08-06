import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';
import { ProductVariant } from '../../products/entities/product-variant.entity.js';
import { Client } from '../../clients/entities/client.entity.js';

export type ReservationStatus = 'ACTIVE' | 'FULFILLED' | 'CANCELLED';

// Separado / apartado: reserva de stock para un cliente. Reduce el disponible
// para la venta (a otros), pero el par sigue en inventario, marcado.
@Entity('reservations')
export class Reservation extends TenantAwareEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ProductVariant)
  @JoinColumn({ name: 'variant_id' })
  variant: ProductVariant;

  @Index()
  @Column({ name: 'variant_id', type: 'uuid' })
  variantId: string;

  @Column({ name: 'warehouse_id', type: 'uuid' })
  warehouseId: string;

  @Column({ type: 'int', default: 1 })
  quantity: number;

  @ManyToOne(() => Client, { nullable: true })
  @JoinColumn({ name: 'client_id' })
  client?: Client | null;

  @Column({ name: 'client_id', type: 'uuid', nullable: true })
  clientId?: string | null;

  // Nombre libre del cliente (cuando no es un cliente registrado).
  @Column({ name: 'client_name', type: 'varchar', nullable: true })
  clientName?: string | null;

  @Column({ type: 'text', nullable: true })
  note?: string | null;

  @Column({ type: 'varchar', default: 'ACTIVE' })
  status: ReservationStatus;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt?: Date | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdById?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
