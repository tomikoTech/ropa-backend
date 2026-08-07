import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ExpenseCategory } from './expense-category.entity.js';
import { Warehouse } from '../../inventory/entities/warehouse.entity.js';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';

/**
 * Egreso: dinero que sale de la operación (no una compra de mercancía).
 *
 * MiPinta ya registraba ingresos; esto cierra la otra mitad para poder saber
 * cuánto queda de verdad, no solo cuánto entró.
 */
@Entity('expenses')
export class Expense extends TenantAwareEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'expense_number' })
  expenseNumber: string;

  @ManyToOne(() => ExpenseCategory, {
    nullable: true,
    eager: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'category_id' })
  category: ExpenseCategory | null;

  @Column({ name: 'category_id', type: 'uuid', nullable: true })
  categoryId: string | null;

  @ManyToOne(() => Warehouse, {
    nullable: true,
    eager: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'warehouse_id' })
  warehouse: Warehouse | null;

  @Column({ name: 'warehouse_id', type: 'uuid', nullable: true })
  warehouseId: string | null;

  @Column()
  description: string;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  amount: number;

  /** Forma de pago; y de qué banco salió, si aplica. */
  @Column({ name: 'payment_method', nullable: true, type: 'varchar' })
  paymentMethod: string | null;

  @Column({ name: 'bank_id', type: 'uuid', nullable: true })
  bankId: string | null;

  /** Caja menor de la que salió, si fue un gasto menudo. */
  @Column({ name: 'petty_cash_id', type: 'uuid', nullable: true })
  pettyCashId: string | null;

  @Column({ name: 'expense_date', type: 'date' })
  expenseDate: Date;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdById: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
