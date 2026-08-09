import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';
import { ProductVariant } from '../../products/entities/product-variant.entity.js';
import { InternalRequest } from './internal-request.entity.js';

@Entity('internal_request_items')
@Unique(['requestId', 'variantId'])
export class InternalRequestItem extends TenantAwareEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @ManyToOne(() => InternalRequest, (request) => request.items, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'request_id' })
  request: InternalRequest;
  @Column({ name: 'request_id', type: 'uuid' }) requestId: string;
  @ManyToOne(() => ProductVariant, { eager: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'variant_id' })
  variant: ProductVariant;
  @Column({ name: 'variant_id', type: 'uuid' }) variantId: string;
  @Column({ name: 'requested_quantity', type: 'int' })
  requestedQuantity: number;
  @Column({ name: 'prepared_quantity', type: 'int', default: 0 })
  preparedQuantity: number;
  @Column({ name: 'remitted_quantity', type: 'int', default: 0 })
  remittedQuantity: number;
}
