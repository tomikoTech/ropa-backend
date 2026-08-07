import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';
import { Supplier } from '../../suppliers/entities/supplier.entity.js';
import { Warehouse } from '../../inventory/entities/warehouse.entity.js';
import { User } from '../../users/entities/user.entity.js';
import { PurchaseOrderItem } from './purchase-order-item.entity.js';
import { AccountsPayable } from './accounts-payable.entity.js';
import { PurchaseOrderStatus } from '../../common/enums/purchase-order-status.enum.js';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';

@Entity('purchase_orders')
@Unique(['tenantId', 'orderNumber'])
export class PurchaseOrder extends TenantAwareEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'order_number' })
  orderNumber: string;

  // Número de factura del proveedor (referencia externa, opcional).
  @Column({ name: 'supplier_invoice_number', nullable: true })
  supplierInvoiceNumber: string;

  @ManyToOne(() => Supplier, { eager: true })
  @JoinColumn({ name: 'supplier_id' })
  supplier: Supplier;

  @Column({ name: 'supplier_id' })
  supplierId: string;

  @ManyToOne(() => Warehouse, { eager: true })
  @JoinColumn({ name: 'warehouse_id' })
  warehouse: Warehouse;

  @Column({ name: 'warehouse_id' })
  warehouseId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'created_by' })
  createdBy: User;

  @Column({ name: 'created_by' })
  createdById: string;

  @Column({
    type: 'enum',
    enum: PurchaseOrderStatus,
    default: PurchaseOrderStatus.DRAFT,
  })
  status: PurchaseOrderStatus;

  // IVA opcional por orden: subtotal (sin IVA), tasa aplicada y monto de IVA.
  // total = subtotal + tax_amount (IVA agregado al total, no incluido).
  // ── Costeo de importación ────────────────────────────────────────────────
  // Solo se usan cuando la compra es de importación; en una compra local
  // quedan en sus valores neutros (tasa 1, sin fletes) y no cambian nada.

  /** Tasa de cambio aplicada al costo del proveedor. 1 = moneda local. */
  @Column({
    name: 'exchange_rate',
    type: 'decimal',
    precision: 14,
    scale: 4,
    default: 1,
  })
  exchangeRate: number;

  /**
   * Conceptos de flete y nacionalización, con nombre.
   * El sistema anterior tiene cinco columnas `flete1..flete5` sin etiqueta;
   * aquí van con su nombre y sin límite de cuántos.
   */
  @Column({ name: 'freight_costs', type: 'jsonb', default: () => "'[]'" })
  freightCosts: { label: string; amount: number }[];

  /** Cómo se reparte el flete entre las líneas. */
  @Column({ name: 'freight_allocation', default: 'BY_UNITS' })
  freightAllocation: 'BY_UNITS' | 'BY_VALUE';

  /** Fecha estimada de llegada del embarque. */
  @Column({ name: 'arrival_date', type: 'date', nullable: true })
  arrivalDate: Date | null;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  subtotal: number;

  @Column({
    name: 'tax_rate',
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 0,
  })
  taxRate: number;

  @Column({
    name: 'tax_amount',
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: 0,
  })
  taxAmount: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  total: number;

  @Column({ nullable: true })
  notes: string;

  @OneToMany(() => PurchaseOrderItem, (item) => item.purchaseOrder, {
    cascade: true,
  })
  items: PurchaseOrderItem[];

  @OneToMany(() => AccountsPayable, (ap) => ap.purchaseOrder)
  accountsPayable: AccountsPayable[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
