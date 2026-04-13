import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';
import { BotMessage } from './bot-message.entity.js';

@Entity('bot_conversation')
export class BotConversation extends TenantAwareEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'store_slug' })
  storeSlug: string;

  @Column({ name: 'customer_phone' })
  customerPhone: string;

  @Column({ name: 'customer_name', nullable: true })
  customerName: string;

  @Column({ default: 'active' })
  status: string; // 'active' | 'closed'

  @Column({ name: 'escalation_reason', type: 'text', nullable: true })
  escalationReason: string;

  @Column({ name: 'escalation_summary', type: 'text', nullable: true })
  escalationSummary: string;

  @OneToMany(() => BotMessage, (m) => m.conversation, { cascade: true })
  messages: BotMessage[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt: Date;
}
