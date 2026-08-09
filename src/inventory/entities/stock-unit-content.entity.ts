import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';
import { ProductVariant } from '../../products/entities/product-variant.entity.js';
import { Size } from '../../catalogs/entities/size.entity.js';
import { StockUnit } from './stock-unit.entity.js';

/**
 * Snapshot de lo esperado y lo encontrado dentro de una caja física.
 *
 * La curva pertenece al renglón de compra y puede cambiar. Este registro
 * pertenece a una caja concreta y por eso no se reescribe cuando cambia la
 * curva. `expectedQuantity` conserva la diferencia recibida del proveedor y
 * `actualQuantity` es la fuente de verdad al abrir el bulto.
 */
@Entity('stock_unit_contents')
@Unique(['boxUnitId', 'sizeId'])
export class StockUnitContent extends TenantAwareEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => StockUnit, (unit) => unit.contents, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'box_unit_id' })
  boxUnit: StockUnit;

  @Column({ name: 'box_unit_id', type: 'uuid' })
  boxUnitId: string;

  @ManyToOne(() => Size, { eager: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'size_id' })
  size: Size;

  @Column({ name: 'size_id', type: 'uuid' })
  sizeId: string;

  @ManyToOne(() => ProductVariant, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'variant_id' })
  variant: ProductVariant | null;

  @Column({ name: 'variant_id', type: 'uuid', nullable: true })
  variantId: string | null;

  @Column({ name: 'expected_quantity', type: 'int', default: 0 })
  expectedQuantity: number;

  @Column({ name: 'actual_quantity', type: 'int', default: 0 })
  actualQuantity: number;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
