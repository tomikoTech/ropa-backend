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
 * Catálogo de marcas por tenant. El producto guarda la marca como texto
 * (`Product.brand`); esta tabla es el catálogo gestionable (crear/editar/borrar)
 * y la fuente del selector al crear productos. Renombrar/borrar una marca
 * sincroniza los productos que la usaban.
 */
@Entity('brands')
@Unique(['tenantId', 'name'])
export class Brand extends TenantAwareEntity {
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
