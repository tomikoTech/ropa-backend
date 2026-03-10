import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { AccountsReceivable } from './accounts-receivable.entity.js';
import { PaymentMethod } from '../../common/enums/payment-method.enum.js';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';

@Entity('accounts_receivable_payments')
export class AccountsReceivablePayment extends TenantAwareEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => AccountsReceivable, (ar) => ar.payments, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'account_receivable_id' })
  accountReceivable: AccountsReceivable;

  @Column({ name: 'account_receivable_id' })
  accountReceivableId: string;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  amount: number;

  @Column({ type: 'enum', enum: PaymentMethod })
  method: PaymentMethod;

  @Column({ nullable: true })
  reference: string;

  @Column({ name: 'receipt_image_url', nullable: true })
  receiptImageUrl: string;

  @Column({ nullable: true })
  notes: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
