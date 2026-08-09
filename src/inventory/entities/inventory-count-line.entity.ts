import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Unique,
} from 'typeorm';
import { InventoryCount } from './inventory-count.entity.js';
import { ProductVariant } from '../../products/entities/product-variant.entity.js';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';

/**
 * Lo contado de una variante dentro de un conteo.
 *
 * Se acumula por escaneo: cada lectura suma 1, que es como se cuenta en
 * bodega (pasando el lector por la mercancía, no tecleando totales).
 */
@Entity('inventory_count_lines')
@Unique(['countId', 'variantId'])
export class InventoryCountLine extends TenantAwareEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => InventoryCount, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'count_id' })
  count: InventoryCount;

  @Column({ name: 'count_id' })
  countId: string;

  @ManyToOne(() => ProductVariant, { eager: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'variant_id' })
  variant: ProductVariant;

  @Column({ name: 'variant_id' })
  variantId: string;

  @Column({ name: 'counted_quantity', type: 'int', default: 0 })
  countedQuantity: number;

  /** Foto del stock agregado al momento de abrir el conteo. */
  @Column({ name: 'expected_quantity', type: 'int', default: 0 })
  expectedQuantity: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
