import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';
import { AccessRole } from './access-role.entity.js';

/**
 * Lo que un rol puede hacer en un módulo: las cuatro acciones del sistema
 * anterior (Listar / Adicionar / Editar / Borrar) en una sola fila.
 *
 * Una fila por (rol, módulo) y no una por (rol, módulo, acción): son cuatro
 * banderas que siempre se leen juntas, y así la matriz de una tienda son ~30
 * filas por rol en vez de 120.
 *
 * Lo que no está en la tabla está **negado**: no hay que crear filas para todo
 * lo que un rol no puede hacer.
 */
@Entity('role_permissions')
@Unique(['roleId', 'module'])
export class RolePermission extends TenantAwareEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => AccessRole, (r) => r.permissions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'role_id' })
  role: AccessRole;

  @Column({ name: 'role_id' })
  roleId: string;

  /** Clave del módulo (`module-registry.ts`). */
  @Column()
  module: string;

  @Column({ name: 'can_list', default: false })
  canList: boolean;

  @Column({ name: 'can_create', default: false })
  canCreate: boolean;

  @Column({ name: 'can_edit', default: false })
  canEdit: boolean;

  @Column({ name: 'can_delete', default: false })
  canDelete: boolean;
}
