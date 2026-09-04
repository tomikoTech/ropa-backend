import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity.js';

@Entity('refresh_tokens')
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  token: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'is_revoked', default: false })
  isRevoked: boolean;

  /**
   * Cuándo se revocó por **rotación** (al refrescar). Sirve para la ventana de
   * gracia: un token rotado hace muy poco que vuelve a llegar —una carrera
   * entre pestañas, o un refresh cuya respuesta se perdió— todavía se acepta,
   * para no sacar al usuario por algo transitorio. `null` = nunca revocado, o
   * revocado por cierre de sesión (esos NO entran en la gracia: un logout debe
   * mandar a login de verdad).
   */
  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
