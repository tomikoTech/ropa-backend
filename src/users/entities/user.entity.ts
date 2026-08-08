import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';
import { Role } from '../../common/enums/role.enum.js';
import { Exclude } from 'class-transformer';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';

@Entity('users')
@Unique(['tenantId', 'email'])
@Unique(['tenantId', 'username'])
export class User extends TenantAwareEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  email: string;

  // Nombre de usuario opcional para login (además del email). Ej: "cesar".
  @Column({ nullable: true })
  username: string;

  @Column({ name: 'password_hash' })
  @Exclude()
  passwordHash: string;

  @Column({ name: 'first_name' })
  firstName: string;

  @Column({ name: 'last_name' })
  lastName: string;

  @Column({ type: 'enum', enum: Role, default: Role.COLABORADOR })
  role: Role;

  /**
   * Rol de acceso con matriz de permisos (F8). `null` = sin permisos granulares:
   * el usuario se comporta exactamente como antes de que existieran, mandado
   * solo por `role`.
   *
   * Es lo que permite activar los permisos de a un usuario a la vez sin
   * cambiarle el día a nadie.
   */
  @Column({ name: 'access_role_id', type: 'uuid', nullable: true })
  accessRoleId: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
