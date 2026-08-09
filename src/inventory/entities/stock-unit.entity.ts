import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
  Index,
  OneToMany,
} from 'typeorm';
import { Product } from '../../products/entities/product.entity.js';
import { ProductVariant } from '../../products/entities/product-variant.entity.js';
import { Warehouse } from './warehouse.entity.js';
import { Stand } from './stand.entity.js';
import { Color } from '../../catalogs/entities/color.entity.js';
import { Size } from '../../catalogs/entities/size.entity.js';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';
import { StockUnitContent } from './stock-unit-content.entity.js';

export enum StockUnitKind {
  /** Caja cerrada: se mueve y se vende como un bulto. */
  BOX = 'BOX',
  /** Unidad suelta (par), normalmente salida de abrir una caja. */
  UNIT = 'UNIT',
}

export enum StockUnitStatus {
  IN_STOCK = 'IN_STOCK',
  SOLD = 'SOLD',
  CONSIGNED = 'CONSIGNED',
  TRANSFERRED = 'TRANSFERRED',
  WRITTEN_OFF = 'WRITTEN_OFF',
  /** La caja se abrió: dejó de existir como bulto y nacieron sus unidades. */
  SPLIT = 'SPLIT',
}

/**
 * Un bulto físico del inventario, con su propio código de barras.
 *
 * Es la capa granular que convive con `Stock` (que sigue siendo el agregado
 * por variante y bodega). Solo se usa cuando el producto tiene `unitTracking`;
 * el resto del catálogo funciona exactamente como siempre.
 *
 * Una caja puede **abrirse**: pasa a `SPLIT` y nacen tantas unidades como
 * diga su curva. La caja no se borra, para que la trazabilidad del código
 * impreso no se pierda.
 */
@Entity('stock_units')
@Unique(['tenantId', 'barcode'])
@Index(['tenantId', 'warehouseId', 'status'])
export class StockUnit extends TenantAwareEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Lo que va impreso en la etiqueta, con su dígito verificador. */
  @Column()
  barcode: string;

  @Column({ type: 'enum', enum: StockUnitKind })
  kind: StockUnitKind;

  @Column({
    type: 'enum',
    enum: StockUnitStatus,
    default: StockUnitStatus.IN_STOCK,
  })
  status: StockUnitStatus;

  @ManyToOne(() => Product, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column({ name: 'product_id' })
  productId: string;

  @ManyToOne(() => Color, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'color_id' })
  color: Color | null;

  @Column({ name: 'color_id', type: 'uuid', nullable: true })
  colorId: string | null;

  /** Talla: nula en las cajas (traen varias), presente en las unidades. */
  @ManyToOne(() => Size, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'size_id' })
  size: Size | null;

  @Column({ name: 'size_id', type: 'uuid', nullable: true })
  sizeId: string | null;

  /**
   * Variante equivalente, para que el POS y los reportes sigan viendo el
   * inventario como siempre. En una caja apunta a la variante de la primera
   * talla; en una unidad, a la suya.
   */
  @ManyToOne(() => ProductVariant, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'variant_id' })
  variant: ProductVariant | null;

  @Column({ name: 'variant_id', type: 'uuid', nullable: true })
  variantId: string | null;

  @ManyToOne(() => Warehouse, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'warehouse_id' })
  warehouse: Warehouse;

  @Column({ name: 'warehouse_id' })
  warehouseId: string;

  /** Ubicación física dentro de la bodega. */
  @ManyToOne(() => Stand, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'stand_id' })
  stand: Stand | null;

  @Column({ name: 'stand_id', type: 'uuid', nullable: true })
  standId: string | null;

  /** Unidades que contiene: la caja trae varias, la unidad trae 1. */
  @Column({ type: 'int', default: 1 })
  quantity: number;

  /** Costo puesto en bodega por unidad, ya con tasa y fletes. */
  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  cost: number;

  /** Renglón de compra del que salió (trazabilidad hasta el proveedor). */
  @Column({ name: 'purchase_box_line_id', type: 'uuid', nullable: true })
  purchaseBoxLineId: string | null;

  /** Caja de la que salió esta unidad, si vino de abrir una. */
  @Column({ name: 'parent_unit_id', type: 'uuid', nullable: true })
  parentUnitId: string | null;

  @OneToMany(() => StockUnitContent, (content) => content.boxUnit)
  contents: StockUnitContent[];

  @Column({ name: 'printed_at', type: 'timestamptz', nullable: true })
  printedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
