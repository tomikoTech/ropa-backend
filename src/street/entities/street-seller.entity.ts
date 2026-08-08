import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';

/**
 * Patinador: el vendedor de calle que sale con mercancía y vuelve con la plata
 * y con lo que no vendió.
 *
 * Lleva un **carnet con código de barras** para identificarse al despachar, con
 * el mismo dígito verificador EAN que las etiquetas de los bultos: así se lee
 * con el mismo lector y no hay que comprar nada nuevo.
 *
 * Diferencia con el sistema anterior: allá el único patinador registrado **no
 * tenía código**, y el endpoint que lo valida lo rechazaba sin decir por qué,
 * dejando el flujo entero bloqueado. Aquí el código **se genera solo** al crear
 * el patinador, así que no puede faltar.
 */
@Entity('street_sellers')
@Unique(['tenantId', 'code'])
export class StreetSeller extends TenantAwareEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  /** Lo que va impreso en el carnet, con su dígito verificador. */
  @Column()
  code: string;

  @Column({ name: 'document_number', type: 'varchar', nullable: true })
  documentNumber: string | null;

  @Column({ type: 'varchar', nullable: true })
  phone: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
