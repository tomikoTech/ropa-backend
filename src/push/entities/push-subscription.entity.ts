import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';

/**
 * La suscripción de **un dispositivo** al push. Un usuario puede tener varias
 * (celular + computador). El `endpoint` es la dirección única que da el
 * navegador; si vuelve a suscribirse, se actualiza esa misma fila.
 *
 * Cuando el navegador la caduca, el envío responde 404/410 y se borra sola.
 */
@Entity('push_subscriptions')
@Unique(['endpoint'])
export class PushSubscription extends TenantAwareEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  @Index()
  userId: string;

  @Column({ type: 'text' })
  endpoint: string;

  /** Claves del navegador para cifrar el mensaje (Web Push). */
  @Column({ type: 'varchar' })
  p256dh: string;

  @Column({ type: 'varchar' })
  auth: string;

  @Column({ name: 'user_agent', type: 'varchar', nullable: true })
  userAgent: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
