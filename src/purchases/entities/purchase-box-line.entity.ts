import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PurchaseOrder } from './purchase-order.entity.js';
import { Product } from '../../products/entities/product.entity.js';
import { Color } from '../../catalogs/entities/color.entity.js';
import { SizeCurve } from '../../catalogs/entities/size-curve.entity.js';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';

/**
 * Renglón de compra **por cajas** (el `pedidodetalle` del sistema anterior).
 *
 * Se separa de `PurchaseOrderItem` porque una caja **no es una variante**:
 * contiene varias tallas a la vez, definidas por la curva. Por eso la línea
 * apunta a producto + color, y las tallas salen del surtido.
 *
 * Las compras que ya existen (línea por variante) siguen funcionando igual:
 * una orden puede tener líneas clásicas, líneas por caja, o ambas.
 */
@Entity('purchase_box_lines')
export class PurchaseBoxLine extends TenantAwareEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => PurchaseOrder, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'purchase_order_id' })
  purchaseOrder: PurchaseOrder;

  @Column({ name: 'purchase_order_id' })
  purchaseOrderId: string;

  @ManyToOne(() => Product, { eager: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column({ name: 'product_id' })
  productId: string;

  @ManyToOne(() => Color, { nullable: true, eager: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'color_id' })
  color: Color | null;

  @Column({ name: 'color_id', type: 'uuid', nullable: true })
  colorId: string | null;

  /** Curva de tallas: define qué tallas y cuántas trae cada caja. */
  @ManyToOne(() => SizeCurve, {
    nullable: true,
    eager: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'size_curve_id' })
  sizeCurve: SizeCurve | null;

  @Column({ name: 'size_curve_id', type: 'uuid', nullable: true })
  sizeCurveId: string | null;

  /** Número de CAJAS de este renglón. */
  @Column({ type: 'int' })
  boxes: number;

  /** Unidades (pares) dentro de cada caja. */
  @Column({ name: 'units_per_box', type: 'int' })
  unitsPerBox: number;

  /** Costo por unidad en la moneda del proveedor (antes de tasa y fletes). */
  @Column({ name: 'unit_cost', type: 'decimal', precision: 14, scale: 2 })
  unitCost: number;

  /** Precio de venta sugerido que se le pondrá al producto al recibirlo. */
  @Column({
    name: 'sale_price',
    type: 'decimal',
    precision: 14,
    scale: 2,
    nullable: true,
  })
  salePrice: number | null;

  /** Correlativo dentro de la orden; es lo que se imprime en la etiqueta. */
  @Column({ type: 'int' })
  consecutive: number;

  /** Cajas ya detalladas a inventario (recepción parcial). */
  @Column({ name: 'boxes_received', type: 'int', default: 0 })
  boxesReceived: number;

  @Column({ type: 'text', nullable: true })
  comment: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
