import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Unique,
} from 'typeorm';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';

/**
 * Tipo de gasto (arriendo, servicios, transporte...).
 *
 * En el sistema anterior el "tipo de gasto" y el gasto con valor son dos
 * cosas distintas y confusas de administrar; aquí el tipo es solo un
 * catálogo y el gasto siempre lleva su valor.
 */
@Entity('expense_categories')
@Unique(['tenantId', 'name'])
export class ExpenseCategory extends TenantAwareEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
