import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';
import { EcommerceOrder } from './ecommerce-order.entity.js';

@Entity('ecommerce_order_items')
export class EcommerceOrderItem extends TenantAwareEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => EcommerceOrder, (order) => order.items, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'order_id' })
  order: EcommerceOrder;

  @Column({ name: 'order_id' })
  orderId: string;

  @Column({ name: 'variant_id', type: 'uuid' })
  variantId: string;

  @Column({ name: 'product_name' })
  productName: string;

  @Column({ name: 'product_slug', nullable: true })
  productSlug: string;

  @Column({ name: 'product_image_url', nullable: true })
  productImageUrl: string;

  @Column({ name: 'variant_sku' })
  variantSku: string;

  @Column({ name: 'variant_size' })
  variantSize: string;

  @Column({ name: 'variant_color' })
  variantColor: string;

  @Column({ type: 'int' })
  quantity: number;

  @Column({ name: 'unit_price', type: 'decimal', precision: 12, scale: 2 })
  unitPrice: number;

  @Column({
    name: 'discount_percent',
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 0,
  })
  discountPercent: number;

  @Column({
    name: 'tax_rate',
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 19,
  })
  taxRate: number;

  @Column({ name: 'line_total', type: 'decimal', precision: 14, scale: 2 })
  lineTotal: number;
}
