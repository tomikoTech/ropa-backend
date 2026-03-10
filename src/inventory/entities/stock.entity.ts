import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { ProductVariant } from '../../products/entities/product-variant.entity.js';
import { Warehouse } from './warehouse.entity.js';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';

@Entity('stock')
@Unique(['tenantId', 'variantId', 'warehouseId'])
export class Stock extends TenantAwareEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ProductVariant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'variant_id' })
  variant: ProductVariant;

  @Column({ name: 'variant_id' })
  variantId: string;

  @ManyToOne(() => Warehouse, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'warehouse_id' })
  warehouse: Warehouse;

  @Column({ name: 'warehouse_id' })
  warehouseId: string;

  @Column({ type: 'int', default: 0 })
  quantity: number;

  @Column({ name: 'min_stock', type: 'int', default: 0 })
  minStock: number;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
