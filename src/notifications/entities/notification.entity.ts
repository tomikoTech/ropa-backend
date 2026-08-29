import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';

/**
 * Tipos de aviso. Cada uno decide su ícono y a dónde lleva al tocarlo.
 * - `internal_request`: alguien pidió mercancía prestada de una bodega.
 * - `low_stock`: el sistema detectó faltantes y ya armó qué reponer.
 * - `sale_authorization`: un vendedor dejó una venta esperando autorización.
 */
export type NotificationType =
  | 'internal_request'
  | 'low_stock'
  | 'sale_authorization';

/**
 * Un aviso para **una persona**. Un mismo evento (una solicitud, una venta por
 * autorizar) genera una fila por cada destinatario, para que cada quien la
 * marque leída por su lado.
 *
 * `dedupeKey` evita el aviso repetido: si el mismo evento se procesa dos veces
 * (reintentos, doble guardado), no llega dos veces a la misma persona.
 */
@Entity('notifications')
@Index(['tenantId', 'userId', 'readAt'])
export class Notification extends TenantAwareEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** A quién le llega. */
  @Column({ name: 'user_id', type: 'uuid' })
  @Index()
  userId: string;

  @Column({ type: 'varchar' })
  type: NotificationType;

  @Column()
  title: string;

  @Column({ type: 'text' })
  body: string;

  /** A dónde navega al tocarla (ruta del front). */
  @Column({ type: 'varchar', nullable: true })
  link: string | null;

  /** Null = sin leer. Se llena al marcarla leída. */
  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt: Date | null;

  /** Clave del evento+destinatario para no repetir el mismo aviso. */
  @Column({ name: 'dedupe_key', type: 'varchar', nullable: true })
  @Index()
  dedupeKey: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
