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
import { Shelf } from './shelf.entity.js';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';

/**
 * Stand: subdivisión de una estantería (ver [Shelf]).
 *
 * Es la ubicación más fina del inventario. Cuando el producto se maneja por
 * unidades etiquetadas, cada bulto se asigna a un stand, y de ahí salen los
 * reportes de "qué hay en cada stand".
 *
 * El nombre es único dentro de la estantería: la estantería A y la B pueden
 * tener cada una su stand "1".
 */
@Entity('stands')
@Unique(['tenantId', 'shelfId', 'name'])
export class Stand extends TenantAwareEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Shelf, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'shelf_id' })
  shelf: Shelf;

  @Column({ name: 'shelf_id' })
  shelfId: string;

  @Column()
  name: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
