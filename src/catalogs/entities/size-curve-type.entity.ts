import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';

/**
 * Familia de curvas de tallas (ej. "DAMA", "HOMBRE 6-6-6-3-3").
 *
 * Agrupa las curvas por el tipo de mercancía a la que aplican, que es como el
 * comprador las piensa al armar un pedido de importación.
 */
@Entity('size_curve_types')
@Unique(['tenantId', 'name'])
export class SizeCurveType extends TenantAwareEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
