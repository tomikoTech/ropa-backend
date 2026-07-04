import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Production } from './production.entity.js';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';

// Esencia consumida en una producción (cantidad en ml).
@Entity('production_items')
export class ProductionItem extends TenantAwareEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Production, (p) => p.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'production_id' })
  production: Production;

  @Column({ name: 'production_id' })
  productionId: string;

  // Variante de esencia consumida
  @Column({ name: 'variant_id' })
  variantId: string;

  // Cantidad consumida en ml
  @Column({ type: 'int' })
  quantity: number;
}
