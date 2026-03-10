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
import { Sale } from './sale.entity.js';
import { Client } from '../../clients/entities/client.entity.js';
import { AccountsReceivablePayment } from './accounts-receivable-payment.entity.js';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';

@Entity('accounts_receivable')
export class AccountsReceivable extends TenantAwareEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Sale, (sale) => sale.accountsReceivable, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'sale_id' })
  sale: Sale;

  @Column({ name: 'sale_id' })
  saleId: string;

  @ManyToOne(() => Client)
  @JoinColumn({ name: 'client_id' })
  client: Client;

  @Column({ name: 'client_id' })
  clientId: string;

  @Column({
    name: 'total_amount',
    type: 'decimal',
    precision: 14,
    scale: 2,
  })
  totalAmount: number;

  @Column({
    name: 'paid_amount',
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: 0,
  })
  paidAmount: number;

  @Column({ name: 'due_date', type: 'date' })
  dueDate: Date;

  @Column({ name: 'is_fully_paid', default: false })
  isFullyPaid: boolean;

  @Column({ name: 'fully_paid_at', type: 'timestamptz', nullable: true })
  fullyPaidAt: Date;

  @Column({ nullable: true })
  notes: string;

  @OneToMany(() => AccountsReceivablePayment, (p) => p.accountReceivable, {
    cascade: true,
  })
  payments: AccountsReceivablePayment[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
