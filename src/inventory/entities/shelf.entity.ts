import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';
import { Warehouse } from './warehouse.entity.js';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';

/**
 * Estantería dentro de una bodega.
 *
 * Es el primer nivel de ubicación física: una bodega tiene estanterías y cada
 * estantería tiene stands (ver [Stand]). Sirve para saber **dónde está** una
 * unidad, no solo cuántas hay, que es lo que permite encontrarla al despachar
 * o al hacer un conteo físico.
 *
 * El nombre es único dentro de la bodega, no del tenant: dos bodegas pueden
 * tener cada una su estantería "A".
 */
@Entity('shelves')
@Unique(['tenantId', 'warehouseId', 'name'])
export class Shelf extends TenantAwareEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Warehouse, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'warehouse_id' })
  warehouse: Warehouse;

  @Column({ name: 'warehouse_id' })
  warehouseId: string;

  @Column()
  name: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
