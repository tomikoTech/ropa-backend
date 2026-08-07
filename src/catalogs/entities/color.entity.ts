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
 * Catálogo de colores por tenant.
 *
 * Mismo criterio que [Size]: la variante guarda el color como texto
 * (`ProductVariant.color`) y renombrar aquí sincroniza las variantes.
 * El id estable lo necesitan los renglones de compra por cajas, que se
 * registran por (producto, color).
 */
@Entity('colors')
@Unique(['tenantId', 'name'])
export class Color extends TenantAwareEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  /** Color de muestra para la UI (#RRGGBB). Opcional. */
  // Tipo explícito: con `string | null` TypeORM infiere Object (ver Size.sizeGroup).
  @Column({ type: 'varchar', nullable: true })
  hex: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
