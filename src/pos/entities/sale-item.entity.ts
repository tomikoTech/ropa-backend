import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, Index } from 'typeorm';
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

  /**
   * Por acá se leen y se borran los renglones al abrir o editar una factura.
   * Sin índice era un `Seq Scan` sobre toda la tabla, dentro de la transacción
   * de la venta y con la fila de stock bloqueada.
   */
  @Index('IDX_sale_items_sale')
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

  /**
   * Los códigos de los pares que se llevó esta línea. **No es una columna.**
   *
   * `stockUnitId` solo existe cuando el cajero escaneó, y guarda uno solo; una
   * línea de dos pares se lleva dos códigos. Se calculan al pedir el detalle,
   * leyendo los movimientos de inventario que dejó la venta —que es donde el
   * ledger los anota— para no duplicar el dato en dos sitios.
   */
  unitBarcodes?: string[] | null;

  /**
   * Los bultos de esos mismos códigos, para poder señalar un par al editar.
   *
   * No es una columna: se calcula al leer, igual que `unitBarcodes`. La
   * pantalla muestra el código —que es el que está impreso en la caja— y el
   * servidor necesita el bulto.
   */
  stockUnitIds?: string[] | null;

  /**
   * Qué se vendió: una caja cerrada, un par etiquetado, o nada de eso.
   *
   * Es un snapshot y no una consulta al bulto a propósito: la caja se abre,
   * se traslada y cambia de estado después de la venta, y la factura tiene
   * que seguir diciendo lo que se entregó ese día.
   */
  @Column({ name: 'unit_kind', type: 'varchar', nullable: true })
  unitKind: 'BOX' | 'UNIT' | null;

  /**
   * El surtido real de la caja: qué tallas trae y cuántos pares de cada una.
   *
   * Sin esto la línea guardaba la talla de la **variante equivalente** —la
   * primera del producto—, así que una caja surtida 36-39 quedaba registrada
   * como «talla 36». El mayorista se llevaba una factura que no decía qué
   * había recibido, y en el historial no había forma de reconstruirlo.
   */
  @Column({ name: 'box_contents', type: 'jsonb', nullable: true })
  boxContents: { size: string; quantity: number }[] | null;

  // Snapshot fields — preserve data at time of sale
  @Column({ name: 'product_name' })
  productName: string;

  @Column({ name: 'variant_sku' })
  variantSku: string;

  /**
   * Los otros dos códigos con los que se identifica lo vendido: la referencia
   * impresa en la caja y el código de barras del escáner.
   *
   * Snapshot como el resto: si mañana se renumera la referencia, esta factura
   * debe seguir diciendo con qué código se vendió.
   */
  @Column({ name: 'product_code', type: 'varchar', nullable: true })
  productCode: string | null;

  @Column({ name: 'variant_barcode', type: 'varchar', nullable: true })
  variantBarcode: string | null;

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
