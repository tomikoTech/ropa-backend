import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';
import { StockUnit } from './stock-unit.entity.js';
import { InventoryCount } from './inventory-count.entity.js';

/** Código físico que el sistema esperaba encontrar al abrir un conteo. */
@Entity('inventory_count_expected_units')
@Unique(['countId', 'stockUnitId'])
export class InventoryCountExpectedUnit extends TenantAwareEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => InventoryCount, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'count_id' })
  count: InventoryCount;

  @Column({ name: 'count_id', type: 'uuid' })
  countId: string;

  @ManyToOne(() => StockUnit, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'stock_unit_id' })
  stockUnit: StockUnit;

  @Column({ name: 'stock_unit_id', type: 'uuid' })
  stockUnitId: string;

  @Column()
  barcode: string;

  @Column({ type: 'int' })
  quantity: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
