import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';
import { RolePermission } from './role-permission.entity.js';

/**
 * Rol de acceso de la tienda, con su propia matriz de permisos.
 *
 * El sistema anterior tiene seis roles fijos en código. Aquí los roles son
 * **de la tienda**: se crean desde una plantilla (Cajero, Jefe de Bodega…) y se
 * ajustan. Así una zapatería y una perfumería no tienen que compartir la misma
 * idea de lo que hace un "Jefe de Bodega".
 *
 * Los roles del sistema (`users.role`: SUPER_ADMIN / ADMIN / COLABORADOR) siguen
 * existiendo: un usuario **sin** rol de acceso asignado se comporta exactamente
 * como antes de que esto existiera. Es lo que permite activar los permisos de a
 * un usuario a la vez, sin cambiarle el día a nadie.
 */
@Entity('access_roles')
@Unique(['tenantId', 'name'])
export class AccessRole extends TenantAwareEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  /** Plantilla de la que salió, para poder decir "sale de Cajero, modificado". */
  @Column({ name: 'template_key', type: 'varchar', nullable: true })
  templateKey: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @OneToMany(() => RolePermission, (p) => p.role, { cascade: true })
  permissions: RolePermission[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
