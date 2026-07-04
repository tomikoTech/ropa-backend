import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  CreateDateColumn,
} from 'typeorm';
import { ProductionItem } from './production-item.entity.js';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';

@Entity('productions')
export class Production extends TenantAwareEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'warehouse_id' })
  warehouseId: string;

  // Loción (variante) producida — opcional: se puede registrar solo el
  // consumo de esencias sin producir una loción concreta.
  @Column({ name: 'produced_variant_id', type: 'uuid', nullable: true })
  producedVariantId: string | null;

  @Column({ name: 'produced_quantity', type: 'int', default: 0 })
  producedQuantity: number;

  @Column({ nullable: true })
  notes: string;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdById: string | null;

  @OneToMany(() => ProductionItem, (item) => item.production, { cascade: true })
  items: ProductionItem[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
