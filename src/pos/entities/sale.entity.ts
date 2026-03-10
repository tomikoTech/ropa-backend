import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';
import { Client } from '../../clients/entities/client.entity.js';
import { User } from '../../users/entities/user.entity.js';
import { Warehouse } from '../../inventory/entities/warehouse.entity.js';
import { SaleItem } from './sale-item.entity.js';
import { Payment } from './payment.entity.js';
import { AccountsReceivable } from './accounts-receivable.entity.js';
import { SaleStatus } from '../../common/enums/sale-status.enum.js';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';

@Entity('sales')
@Unique(['tenantId', 'saleNumber'])
@Unique(['tenantId', 'invoiceNumber'])
export class Sale extends TenantAwareEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'sale_number' })
  saleNumber: string;

  @Column({ name: 'invoice_number', nullable: true })
  invoiceNumber: string;

  @ManyToOne(() => Client, { nullable: true })
  @JoinColumn({ name: 'client_id' })
  client: Client;

  @Column({ name: 'client_id', nullable: true })
  clientId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => Warehouse)
  @JoinColumn({ name: 'warehouse_id' })
  warehouse: Warehouse;

  @Column({ name: 'warehouse_id' })
  warehouseId: string;

  @Column({
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: 0,
  })
  subtotal: number;

  @Column({
    name: 'discount_amount',
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: 0,
  })
  discountAmount: number;

  @Column({
    name: 'tax_amount',
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: 0,
  })
  taxAmount: number;

  @Column({
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: 0,
  })
  total: number;

  @Column({
    type: 'enum',
    enum: SaleStatus,
    default: SaleStatus.PENDING,
  })
  status: SaleStatus;

  @Column({ nullable: true })
  notes: string;

  @OneToMany(() => SaleItem, (item) => item.sale, { cascade: true })
  items: SaleItem[];

  @OneToMany(() => Payment, (payment) => payment.sale, { cascade: true })
  payments: Payment[];

  @OneToMany(() => AccountsReceivable, (ar) => ar.sale)
  accountsReceivable: AccountsReceivable[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
