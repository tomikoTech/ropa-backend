import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';
import { User } from '../../users/entities/user.entity.js';
import { StockUnit } from './stock-unit.entity.js';
import { InventoryCount } from './inventory-count.entity.js';

export enum InventoryCountScanResult {
  COUNTED = 'COUNTED',
  SURPLUS = 'SURPLUS',
  DUPLICATE = 'DUPLICATE',
  UNKNOWN = 'UNKNOWN',
  WRONG_WAREHOUSE = 'WRONG_WAREHOUSE',
  NOT_AVAILABLE = 'NOT_AVAILABLE',
}

/** Lectura inmutable del escáner. También conserva las novedades. */
@Entity('inventory_count_scans')
@Unique(['countId', 'clientScanId'])
@Index(['tenantId', 'countId', 'createdAt'])
export class InventoryCountScan extends TenantAwareEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => InventoryCount, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'count_id' })
  count: InventoryCount;

  @Column({ name: 'count_id', type: 'uuid' })
  countId: string;

  /** Id generado en el dispositivo: hace seguros los reintentos offline. */
  @Column({ name: 'client_scan_id', type: 'varchar' })
  clientScanId: string;

  @Column({ name: 'device_id', type: 'varchar', nullable: true })
  deviceId: string | null;

  @Column()
  barcode: string;

  @ManyToOne(() => StockUnit, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'stock_unit_id' })
  stockUnit: StockUnit | null;

  @Column({ name: 'stock_unit_id', type: 'uuid', nullable: true })
  stockUnitId: string | null;

  @Column({ type: 'varchar' })
  result: InventoryCountScanResult;

  @Column({ type: 'int', default: 0 })
  quantity: number;

  @Column({ type: 'text' })
  message: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'scanned_by' })
  scannedBy: User | null;

  @Column({ name: 'scanned_by', type: 'uuid', nullable: true })
  scannedById: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
