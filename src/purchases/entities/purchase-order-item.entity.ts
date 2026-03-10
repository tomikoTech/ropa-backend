import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { PurchaseOrder } from './purchase-order.entity.js';
import { ProductVariant } from '../../products/entities/product-variant.entity.js';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';

@Entity('purchase_order_items')
export class PurchaseOrderItem extends TenantAwareEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => PurchaseOrder, (po) => po.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'purchase_order_id' })
  purchaseOrder: PurchaseOrder;

  @Column({ name: 'purchase_order_id' })
  purchaseOrderId: string;

  @ManyToOne(() => ProductVariant, { eager: true })
  @JoinColumn({ name: 'variant_id' })
  variant: ProductVariant;

  @Column({ name: 'variant_id' })
  variantId: string;

  @Column({ name: 'quantity_ordered', type: 'int' })
  quantityOrdered: number;

  @Column({ name: 'quantity_received', type: 'int', default: 0 })
  quantityReceived: number;

  @Column({ name: 'unit_cost', type: 'decimal', precision: 14, scale: 2 })
  unitCost: number;
}
