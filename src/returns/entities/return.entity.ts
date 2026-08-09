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
import { Sale } from '../../pos/entities/sale.entity.js';
import { Client } from '../../clients/entities/client.entity.js';
import { User } from '../../users/entities/user.entity.js';
import { ReturnItem } from './return-item.entity.js';
import { CreditNote } from './credit-note.entity.js';
import { ReturnStatus } from '../../common/enums/return-status.enum.js';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';
import { Warehouse } from '../../inventory/entities/warehouse.entity.js';
import { Bank } from '../../banks/entities/bank.entity.js';
import { PaymentMethod } from '../../common/enums/payment-method.enum.js';

@Entity('returns')
@Unique(['tenantId', 'returnNumber'])
export class Return extends TenantAwareEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'return_number' })
  returnNumber: string;

  @ManyToOne(() => Sale)
  @JoinColumn({ name: 'sale_id' })
  sale: Sale;

  @Column({ name: 'sale_id' })
  saleId: string;

  @ManyToOne(() => Client)
  @JoinColumn({ name: 'client_id' })
  client: Client;

  @Column({ name: 'client_id' })
  clientId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id' })
  userId: string;

  @Column()
  reason: string;

  @Column({
    type: 'enum',
    enum: ReturnStatus,
    default: ReturnStatus.PENDING,
  })
  status: ReturnStatus;

  @Column({
    name: 'refund_amount',
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: 0,
  })
  refundAmount: number;

  /** Positivo: el cliente paga diferencia. Negativo: se le reintegra. */
  @Column({
    name: 'price_difference',
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: 0,
  })
  priceDifference: number;

  @Column({ name: 'settlement_method', type: 'varchar', nullable: true })
  settlementMethod: PaymentMethod | null;

  @ManyToOne(() => Bank, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'settlement_bank_id' })
  settlementBank: Bank | null;

  @Column({ name: 'settlement_bank_id', type: 'uuid', nullable: true })
  settlementBankId: string | null;

  @Column({ name: 'settlement_reference', type: 'varchar', nullable: true })
  settlementReference: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'received_by_id' })
  receivedBy: User | null;

  @Column({ name: 'received_by_id', type: 'uuid', nullable: true })
  receivedById: string | null;

  @ManyToOne(() => Warehouse, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'destination_warehouse_id' })
  destinationWarehouse: Warehouse | null;

  @Column({ name: 'destination_warehouse_id', type: 'uuid', nullable: true })
  destinationWarehouseId: string | null;

  @ManyToOne(() => Warehouse, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'remittance_warehouse_id' })
  remittanceWarehouse: Warehouse | null;

  @Column({ name: 'remittance_warehouse_id', type: 'uuid', nullable: true })
  remittanceWarehouseId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'remitted_by_id' })
  remittedBy: User | null;

  @Column({ name: 'remitted_by_id', type: 'uuid', nullable: true })
  remittedById: string | null;

  @Column({ name: 'remitted_at', type: 'timestamptz', nullable: true })
  remittedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @OneToMany(() => ReturnItem, (item) => item.return, { cascade: true })
  items: ReturnItem[];

  @OneToMany(() => CreditNote, (cn) => cn.return)
  creditNotes: CreditNote[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
