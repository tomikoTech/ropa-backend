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

  @Column({ name: 'refund_amount', type: 'decimal', precision: 14, scale: 2, default: 0 })
  refundAmount: number;

  @OneToMany(() => ReturnItem, (item) => item.return, { cascade: true })
  items: ReturnItem[];

  @OneToMany(() => CreditNote, (cn) => cn.return)
  creditNotes: CreditNote[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
