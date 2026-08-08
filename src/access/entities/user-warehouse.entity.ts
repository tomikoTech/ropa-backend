import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Unique,
} from 'typeorm';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';
import { User } from '../../users/entities/user.entity.js';
import { Warehouse } from '../../inventory/entities/warehouse.entity.js';

/**
 * Bodegas a las que un usuario tiene acceso (el `Userbodega` del sistema
 * anterior).
 *
 * **Sin filas no hay restricción**: un usuario sin bodegas asignadas ve todas,
 * que es como funciona hoy. En el momento en que se le asigna una, deja de ver
 * el resto: los desplegables solo muestran las suyas y el servidor rechaza una
 * venta, un ajuste o un traslado sobre una bodega que no le corresponde.
 *
 * Es lo que permite que el encargado de un punto no pueda vender contra el
 * inventario de otro punto por equivocación.
 */
@Entity('user_warehouses')
@Unique(['userId', 'warehouseId'])
export class UserWarehouse extends TenantAwareEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => Warehouse, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'warehouse_id' })
  warehouse: Warehouse;

  @Column({ name: 'warehouse_id' })
  warehouseId: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
