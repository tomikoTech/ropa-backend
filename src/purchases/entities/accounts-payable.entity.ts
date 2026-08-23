import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PurchaseOrder } from './purchase-order.entity.js';
import { AccountsPayablePayment } from './accounts-payable-payment.entity.js';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';

@Entity('accounts_payable')
export class AccountsPayable extends TenantAwareEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => PurchaseOrder, (po) => po.accountsPayable, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'purchase_order_id' })
  purchaseOrder: PurchaseOrder;

  @Column({ name: 'purchase_order_id' })
  purchaseOrderId: string;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  amount: number;

  @Column({
    name: 'paid_amount',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  paidAmount: number;

  /**
   * El día pactado, como texto `AAAA-MM-DD`.
   *
   * `string` y no `Date` a propósito: un día no es un instante.
   * `new Date('2026-12-25')` es medianoche **UTC**, y al escribirla en una
   * columna `date` el driver toma la fecha local y retrocede al 24. Ver
   * `common/utils/dia-de-calendario.util.ts`.
   */
  @Column({ name: 'due_date', type: 'date' })
  dueDate: string;

  @Column({ name: 'is_paid', default: false })
  isPaid: boolean;

  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt: Date;

  @Column({ nullable: true })
  notes: string;

  @Column({ name: 'receipt_image_url', nullable: true })
  receiptImageUrl: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @OneToMany(() => AccountsPayablePayment, (p) => p.accountsPayable)
  payments: AccountsPayablePayment[];

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
