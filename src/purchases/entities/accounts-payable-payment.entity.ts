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

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
