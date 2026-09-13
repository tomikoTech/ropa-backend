import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { AccountsPayable } from './accounts-payable.entity.js';

@Entity('accounts_payable_payments')
export class AccountsPayablePayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'accounts_payable_id' })
  accountsPayableId: string;

  @ManyToOne(() => AccountsPayable, (ap) => ap.payments)
  @JoinColumn({ name: 'accounts_payable_id' })
  accountsPayable: AccountsPayable;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({ default: 'EFECTIVO' })
  method: string;

  @Column({ nullable: true })
  reference: string;

  @Column({ name: 'receipt_image_url', nullable: true })
  receiptImageUrl: string;

  @Column({ nullable: true })
  notes: string;

  /** De qué cuenta salió la plata (para TARJETA/TRANSFERENCIA). */
  @Column({ name: 'bank_id', type: 'uuid', nullable: true })
  bankId: string | null;

  /** Quién pagó. Nulo en las filas anteriores a que existiera la columna. */
  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  /**
   * Une los renglones que salieron del **mismo** pago.
   *
   * Un pago repartido entre cuatro facturas son cuatro filas. Sin esto se ven
   * como cuatro pagos sin relación: no hay forma de auditarlo junto ni de
   * deshacerlo entero.
   */
  @Column({ name: 'allocation_batch_id', type: 'uuid', nullable: true })
  allocationBatchId: string | null;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
