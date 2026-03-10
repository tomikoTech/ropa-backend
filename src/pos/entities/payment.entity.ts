import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Sale } from './sale.entity.js';
import { PaymentMethod } from '../../common/enums/payment-method.enum.js';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';

@Entity('payments')
export class Payment extends TenantAwareEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Sale, (sale) => sale.payments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sale_id' })
  sale: Sale;

  @Column({ name: 'sale_id' })
  saleId: string;

  @Column({
    type: 'enum',
    enum: PaymentMethod,
  })
  method: PaymentMethod;

  @Column({
    type: 'decimal',
    precision: 14,
    scale: 2,
  })
  amount: number;

  @Column({ nullable: true })
  reference: string;

  @Column({
    name: 'received_amount',
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: 0,
  })
  receivedAmount: number;

  @Column({
    name: 'change_amount',
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: 0,
  })
  changeAmount: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
