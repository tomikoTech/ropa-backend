import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  CreateDateColumn,
} from 'typeorm';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';
import { Consignment } from './consignment.entity.js';

/**
 * Un abono a una venta de tercero. Reemplaza el "pagó / no pagó" por pagos
 * parciales con su método, para los dos lados de la plata:
 *   - CLIENT   → lo que te paga el cliente.
 *   - SUPPLIER → lo que tú le pagas al tercero dueño.
 *
 * El saldo se calcula (total − abonos) en `terceros-cuentas.ts`; aquí solo se
 * guarda cada abono con su fecha y método, para poder ver el histórico y sumar
 * "cuánto entró por transferencia" etc.
 */
@Entity('consignment_payments')
@Index(['tenantId', 'consignmentId'])
export class ConsignmentPayment extends TenantAwareEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Consignment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'consignment_id' })
  consignment: Consignment;

  @Column({ name: 'consignment_id', type: 'uuid' })
  consignmentId: string;

  /** CLIENT (te paga el cliente) | SUPPLIER (le pagas al tercero). */
  @Column({ type: 'varchar' })
  lado: 'CLIENT' | 'SUPPLIER';

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  /** EFECTIVO | TRANSFERENCIA | … (normalizado). */
  @Column({ type: 'varchar', nullable: true })
  method: string | null;

  @Column({ type: 'varchar', nullable: true })
  reference: string | null;

  @Column({ name: 'paid_at', type: 'timestamptz' })
  paidAt: Date;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
