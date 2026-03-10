import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Return } from './return.entity.js';
import { SaleItem } from '../../pos/entities/sale-item.entity.js';
import { ProductVariant } from '../../products/entities/product-variant.entity.js';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';

@Entity('return_items')
export class ReturnItem extends TenantAwareEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Return, (r) => r.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'return_id' })
  return: Return;

  @Column({ name: 'return_id' })
  returnId: string;

  @ManyToOne(() => SaleItem)
  @JoinColumn({ name: 'sale_item_id' })
  saleItem: SaleItem;

  @Column({ name: 'sale_item_id' })
  saleItemId: string;

  @ManyToOne(() => ProductVariant)
  @JoinColumn({ name: 'variant_id' })
  variant: ProductVariant;

  @Column({ name: 'variant_id' })
  variantId: string;

  @Column({ type: 'int' })
  quantity: number;

  @Column({ name: 'unit_price', type: 'decimal', precision: 14, scale: 2 })
  unitPrice: number;
}
