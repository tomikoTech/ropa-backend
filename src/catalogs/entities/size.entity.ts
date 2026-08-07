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
 * Catálogo de tallas por tenant.
 *
 * La variante sigue guardando la talla como texto (`ProductVariant.size`), igual
 * que `Product.brand` con el catálogo de marcas: esta tabla es el catálogo
 * gestionable y la fuente del selector. Renombrar una talla sincroniza las
 * variantes que la usaban.
 *
 * Existe además porque las **curvas de tallas** necesitan referenciar una talla
 * por id estable (un texto libre no sirve para armar el surtido de una caja).
 *
 * `sortOrder` es imprescindible: las tallas tienen orden natural (36, 37, 38...)
 * que el orden alfabético rompe ("10" antes que "9").
 */
@Entity('sizes')
@Unique(['tenantId', 'name'])
export class Size extends TenantAwareEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  /**
   * Agrupación comercial de la talla (en demachine: NIÑO, JUNIOR, LADY...).
   * Sirve para filtrar y para armar curvas por grupo.
   */
  // El tipo se declara explícitamente: con `string | null` la reflexión de
  // TypeORM infiere Object y Postgres rechaza la columna.
  @Column({ name: 'size_group', type: 'varchar', nullable: true })
  sizeGroup: string | null;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
