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

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
