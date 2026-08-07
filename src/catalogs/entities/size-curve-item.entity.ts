import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { SizeCurve } from './size-curve.entity.js';
import { Size } from './size.entity.js';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';

/**
 * Un renglón de la curva: cuántas unidades de una talla trae la caja.
 *
 * Es tabla propia (y no JSON como en el sistema anterior) para que la talla
 * sea una clave foránea real: se puede consultar qué curvas la usan y la base
 * impide borrarla mientras esté referenciada.
 */
@Entity('size_curve_items')
@Unique(['curveId', 'sizeId'])
export class SizeCurveItem extends TenantAwareEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => SizeCurve, (c) => c.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'curve_id' })
  curve: SizeCurve;

  @Column({ name: 'curve_id' })
  curveId: string;

  @ManyToOne(() => Size, { onDelete: 'RESTRICT', eager: true })
  @JoinColumn({ name: 'size_id' })
  size: Size;

  @Column({ name: 'size_id' })
  sizeId: string;

  /** Unidades (pares) de esta talla dentro de la caja. */
  @Column({ type: 'int' })
  quantity: number;
}
