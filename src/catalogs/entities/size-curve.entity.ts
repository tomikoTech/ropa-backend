import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';
import { SizeCurveType } from './size-curve-type.entity.js';
import { SizeCurveItem } from './size-curve-item.entity.js';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';

/**
 * Curva de tallas: el surtido que trae una caja.
 *
 * Una caja de calzado no viene con una sola talla, sino con un reparto
 * (ej. 6 pares de 36, 6 de 37, 6 de 38 y 6 de 39 = 24 pares). Esa es la curva.
 *
 * El detalle vive en [SizeCurveItem] con clave foránea a la talla, no como
 * JSON: así se puede saber qué curvas usan una talla y no quedan referencias
 * rotas si alguien intenta borrarla.
 */
@Entity('size_curves')
@Unique(['tenantId', 'name'])
export class SizeCurve extends TenantAwareEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => SizeCurveType, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'curve_type_id' })
  curveType: SizeCurveType | null;

  @Column({ name: 'curve_type_id', type: 'uuid', nullable: true })
  curveTypeId: string | null;

  @Column()
  name: string;

  @OneToMany(() => SizeCurveItem, (i) => i.curve, { cascade: true })
  items: SizeCurveItem[];

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
