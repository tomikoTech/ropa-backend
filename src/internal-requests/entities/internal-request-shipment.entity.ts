import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';
import { StockTransfer } from '../../inventory/entities/stock-transfer.entity.js';
import { InternalRequest } from './internal-request.entity.js';
import { InternalRequestItem } from './internal-request-item.entity.js';

@Entity('internal_request_shipments')
export class InternalRequestShipment extends TenantAwareEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @ManyToOne(() => InternalRequest, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'request_id' })
  request: InternalRequest;
  @Column({ name: 'request_id', type: 'uuid' }) requestId: string;
  @ManyToOne(() => InternalRequestItem, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'request_item_id' })
  item: InternalRequestItem;
  @Column({ name: 'request_item_id', type: 'uuid' }) requestItemId: string;
  @ManyToOne(() => StockTransfer, { eager: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'transfer_id' })
  transfer: StockTransfer;
  @Column({ name: 'transfer_id', type: 'uuid' }) transferId: string;
  @Column({ type: 'int' }) quantity: number;
  @Column({ name: 'received_at', type: 'timestamptz', nullable: true })
  receivedAt: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
