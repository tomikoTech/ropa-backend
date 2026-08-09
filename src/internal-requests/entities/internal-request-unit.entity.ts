import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';
import { StockUnit } from '../../inventory/entities/stock-unit.entity.js';
import { StockTransfer } from '../../inventory/entities/stock-transfer.entity.js';
import { InternalRequestItem } from './internal-request-item.entity.js';

@Entity('internal_request_units')
@Unique(['requestItemId', 'stockUnitId'])
export class InternalRequestUnit extends TenantAwareEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @ManyToOne(() => InternalRequestItem, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'request_item_id' })
  item: InternalRequestItem;
  @Column({ name: 'request_item_id', type: 'uuid' }) requestItemId: string;
  @ManyToOne(() => StockUnit, { eager: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'stock_unit_id' })
  stockUnit: StockUnit;
  @Column({ name: 'stock_unit_id', type: 'uuid' }) stockUnitId: string;
  @ManyToOne(() => StockTransfer, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'transfer_id' })
  transfer: StockTransfer | null;
  @Column({ name: 'transfer_id', type: 'uuid', nullable: true }) transferId:
    | string
    | null;
}
