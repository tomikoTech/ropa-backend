import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';
import { StreetDispatch } from './street-dispatch.entity.js';
import { ProductVariant } from '../../products/entities/product-variant.entity.js';

/**
 * Un renglón de la remisión rápida: qué se le entregó al patinador y, al volver,
 * cuánto vendió y cuánto devolvió.
 *
 * `quantitySold + quantityReturned` no puede pasarse de `quantity`, y lo que
 * falte es **lo que no cuadró**: se ve como faltante en vez de desaparecer, que
 * es de donde salen los descuadres de inventario.
 *
 * Los datos del producto y el costo van como **snapshot**, igual que en una
 * venta: si mañana cambia el precio o el costo, lo despachado ayer sigue
 * diciendo lo que decía.
 */
@Entity('street_dispatch_items')
export class StreetDispatchItem extends TenantAwareEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => StreetDispatch, (d) => d.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dispatch_id' })
  dispatch: StreetDispatch;

  @Column({ name: 'dispatch_id' })
  dispatchId: string;

  @ManyToOne(() => ProductVariant, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'variant_id' })
  variant: ProductVariant;

  @Column({ name: 'variant_id' })
  variantId: string;

  // ── Snapshots ────────────────────────────────────────────────────────────
  @Column({ name: 'product_name' })
  productName: string;

  @Column({ name: 'variant_sku' })
  variantSku: string;

  @Column({ name: 'variant_size', default: '' })
  variantSize: string;

  @Column({ name: 'variant_color', default: '' })
  variantColor: string;

  /** Bulto etiquetado, si el despacho se hizo escaneando cajas. */
  @Column({ name: 'stock_unit_id', type: 'uuid', nullable: true })
  stockUnitId: string | null;

  @Column({ type: 'int' })
  quantity: number;

  /** Precio con el que sale a la calle. */
  @Column({ name: 'unit_price', type: 'decimal', precision: 12, scale: 2 })
  unitPrice: number;

  /** Costo al momento del despacho, para la utilidad de la calle. */
  @Column({
    name: 'unit_cost',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  unitCost: number;

  @Column({ name: 'quantity_sold', type: 'int', default: 0 })
  quantitySold: number;

  @Column({ name: 'quantity_returned', type: 'int', default: 0 })
  quantityReturned: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
