import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Sale } from './sale.entity.js';
import { ProductVariant } from '../../products/entities/product-variant.entity.js';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';
import { Promoter } from '../../promoters/promoter.entity.js';
import { StockUnit } from '../../inventory/entities/stock-unit.entity.js';

@Entity('sale_items')
export class SaleItem extends TenantAwareEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Sale, (sale) => sale.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sale_id' })
  sale: Sale;

  @Column({ name: 'sale_id' })
  saleId: string;

  @ManyToOne(() => ProductVariant)
  @JoinColumn({ name: 'variant_id' })
  variant: ProductVariant;

  @Column({ name: 'variant_id' })
  variantId: string;

  @ManyToOne(() => Promoter, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'promoter_id' })
  promoter: Promoter | null;

  @Column({ name: 'promoter_id', type: 'uuid', nullable: true })
  promoterId: string | null;

  /** Snapshot: renombrar al impulsador no reescribe ventas históricas. */
  @Column({ name: 'promoter_name', type: 'varchar', nullable: true })
  promoterName: string | null;

  /** Código físico exacto vendido, si la línea salió de un bulto etiquetado. */
  @ManyToOne(() => StockUnit, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'stock_unit_id' })
  stockUnit: StockUnit | null;

  @Column({ name: 'stock_unit_id', type: 'uuid', nullable: true })
  stockUnitId: string | null;

  // Snapshot fields — preserve data at time of sale
  @Column({ name: 'product_name' })
  productName: string;

  @Column({ name: 'variant_sku' })
  variantSku: string;

  @Column({ name: 'variant_size' })
  variantSize: string;

  @Column({ name: 'variant_color' })
  variantColor: string;

  @Column({ type: 'int' })
  quantity: number;

  @Column({
    name: 'unit_price',
    type: 'decimal',
    precision: 12,
    scale: 2,
  })
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

  @Column({
    name: 'tax_amount',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  taxAmount: number;

  @Column({
    name: 'line_total',
    type: 'decimal',
    precision: 14,
    scale: 2,
  })
  lineTotal: number;

  /**
   * Costo unitario **al momento de la venta** (F9).
   *
   * Es un snapshot, igual que el nombre o el precio: si mañana sube el costo
   * del producto, la utilidad de la venta de ayer debe seguir siendo la que
   * fue. Calcularla contra `products.cost_price` la reescribiría cada vez que
   * cambia una compra.
   *
   * Cuando la línea sale de escanear un bulto etiquetado se guarda el costo
   * **puesto en bodega** de ese bulto (ya con tasa de cambio y fletes).
   *
   * `0` significa "sin costo registrado", no "costo cero": los reportes lo
   * cuentan aparte para no inflar la utilidad con margen del 100%.
   */
  @Column({
    name: 'unit_cost',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  unitCost: number;

  // Snapshot de "punta" (F2): si este ítem era una punta al momento de la venta
  // y la comisión calculada para el vendedor. Inmutables (no se recalculan).
  @Column({ name: 'is_leftover', default: false })
  isLeftover: boolean;

  @Column({
    name: 'commission_amount',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  commissionAmount: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
