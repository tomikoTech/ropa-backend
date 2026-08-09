import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';
import { User } from '../../users/entities/user.entity.js';
import {
  IncomeType,
  IncomeCategory,
} from '../../common/enums/income-type.enum.js';

// Libro complementario de tesorería: movimientos manuales y diferencias de
// cambios/devoluciones. La venta original se deriva de payments; aquí solo se
// registra el valor incremental (positivo o negativo) de la operación.
@Entity('income_entries')
export class IncomeEntry extends TenantAwareEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', default: IncomeType.INGRESO })
  type: IncomeType;

  @Column({ type: 'varchar', default: IncomeCategory.OTROS })
  category: IncomeCategory;

  // Monto. En AJUSTE puede ser negativo (restar). En TRANSFERENCIA es el monto
  // movido (sale del origen, entra al destino).
  @Column({ type: 'decimal', precision: 14, scale: 2 })
  amount: number;

  // Método de pago del origen (EFECTIVO, TARJETA, TRANSFERENCIA, CREDITO...).
  @Column({ nullable: true })
  method: string;

  @Column({ name: 'bank_id', type: 'uuid', nullable: true })
  bankId: string | null;

  // Solo para TRANSFERENCIA: destino.
  @Column({ name: 'target_method', nullable: true })
  targetMethod: string;

  @Column({ name: 'target_bank_id', type: 'uuid', nullable: true })
  targetBankId: string | null;

  @Column({ type: 'text', nullable: true })
  note: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  createdBy: User;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdById: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
