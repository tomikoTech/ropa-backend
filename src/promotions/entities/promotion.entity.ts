import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DiscountType } from '../../common/enums/discount-type.enum.js';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';

@Entity('promotions')
export class Promotion extends TenantAwareEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  @Column({
    name: 'discount_type',
    type: 'enum',
    enum: DiscountType,
  })
  discountType: DiscountType;

  @Column({ name: 'discount_value', type: 'decimal', precision: 10, scale: 2 })
  discountValue: number;

  /** 'ALL', 'CATEGORY', 'PRODUCT' — what this promotion applies to */
  @Column({ name: 'applicable_to', default: 'ALL' })
  applicableTo: string;

  /** UUID of category or product when applicableTo is not ALL */
  @Column({ name: 'applicable_id', nullable: true })
  applicableId: string;

  @Column({ name: 'start_date', type: 'timestamptz' })
  startDate: Date;

  @Column({ name: 'end_date', type: 'timestamptz' })
  endDate: Date;

  @Column({ name: 'max_uses', nullable: true })
  maxUses: number;

  @Column({ name: 'current_uses', default: 0 })
  currentUses: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
