import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Unique,
} from 'typeorm';
import { Return } from './return.entity.js';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';

@Entity('credit_notes')
@Unique(['tenantId', 'creditNoteNumber'])
export class CreditNote extends TenantAwareEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'credit_note_number' })
  creditNoteNumber: string;

  @ManyToOne(() => Return, (r) => r.creditNotes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'return_id' })
  return: Return;

  @Column({ name: 'return_id' })
  returnId: string;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  amount: number;

  @Column({ name: 'is_applied', default: false })
  isApplied: boolean;

  @Column({ nullable: true })
  notes: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
