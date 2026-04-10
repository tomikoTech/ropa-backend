import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';
import { EcommerceOrderStatus } from '../../common/enums/ecommerce-order-status.enum.js';
import { ShippingStatus } from '../../common/enums/shipping-status.enum.js';
import { EcommerceOrderItem } from './ecommerce-order-item.entity.js';
import { EcommerceCustomer } from './ecommerce-customer.entity.js';

@Entity('ecommerce_orders')
@Unique(['tenantId', 'orderNumber'])
export class EcommerceOrder extends TenantAwareEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'order_number' })
  orderNumber: string;

  @Column({ name: 'customer_name' })
  customerName: string;

  @Column({ name: 'customer_phone', nullable: true })
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

  @Column({ name: 'payment_method', nullable: true })
  paymentMethod: string;

  @Column({ name: 'wava_order_id', nullable: true })
  wavaOrderId: string;

  @Column({ name: 'wava_payment_status', nullable: true })
  wavaPaymentStatus: string;

  @Column({ name: 'wava_payment_url', nullable: true })
  wavaPaymentUrl: string;

  @Column({ name: 'shipping_city', nullable: true })
  shippingCity: string;

  @Column({ name: 'shipping_address', nullable: true })
  shippingAddress: string;

  @Column({ name: 'shipping_address_details', type: 'text', nullable: true })
  shippingAddressDetails: string;

  @Column({
    name: 'shipping_cost',
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: 0,
  })
  shippingCost: number;

  @Column({
    name: 'shipping_status',
    type: 'enum',
    enum: ShippingStatus,
    nullable: true,
  })
  shippingStatus: ShippingStatus;

  @Column({ name: 'shipping_tracking_code', nullable: true })
  shippingTrackingCode: string;

  @Column({ name: 'shipping_carrier', nullable: true })
  shippingCarrier: string;

  @Column({ name: 'cod_payment_confirmed', default: false })
  codPaymentConfirmed: boolean;

  @Column({ name: 'cod_payment_confirmed_at', type: 'timestamptz', nullable: true })
  codPaymentConfirmedAt: Date;

  @Column({ name: 'admin_notes', type: 'text', nullable: true })
  adminNotes: string;

  @Column({ name: 'warehouse_id', type: 'uuid', nullable: true })
  warehouseId: string;

  @Column({ name: 'customer_id', type: 'uuid', nullable: true })
  customerId: string;

  @ManyToOne(() => EcommerceCustomer, { nullable: true })
  @JoinColumn({ name: 'customer_id' })
  customer: EcommerceCustomer;

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
