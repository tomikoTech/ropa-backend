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
