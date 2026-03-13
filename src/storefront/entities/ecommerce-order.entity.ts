import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';
import { EcommerceOrderStatus } from '../../common/enums/ecommerce-order-status.enum.js';
import { EcommerceOrderItem } from './ecommerce-order-item.entity.js';

@Entity('ecommerce_orders')
@Unique(['tenantId', 'orderNumber'])
export class EcommerceOrder extends TenantAwareEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'order_number' })
  orderNumber: string;

  @Column({ name: 'customer_name' })
  customerName: string;

  @Column({ name: 'customer_phone' })
  customerPhone: string;

  @Column({ name: 'customer_email', nullable: true })
  customerEmail: string;

  @Column({ name: 'customer_notes', type: 'text', nullable: true })
  customerNotes: string;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
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

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  total: number;

  @Column({
    type: 'enum',
    enum: EcommerceOrderStatus,
    default: EcommerceOrderStatus.PENDING,
  })
  status: EcommerceOrderStatus;

  @Column({ name: 'whatsapp_message_sent', default: false })
  whatsappMessageSent: boolean;

  @Column({ name: 'admin_notes', type: 'text', nullable: true })
  adminNotes: string;

  @Column({ name: 'warehouse_id', type: 'uuid', nullable: true })
  warehouseId: string;

  @OneToMany(() => EcommerceOrderItem, (item) => item.order, {
    cascade: true,
    eager: false,
  })
  items: EcommerceOrderItem[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
