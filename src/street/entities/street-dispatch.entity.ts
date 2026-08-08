import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';
import { StreetSeller } from './street-seller.entity.js';
import { Warehouse } from '../../inventory/entities/warehouse.entity.js';
import { StreetDispatchItem } from './street-dispatch-item.entity.js';

export enum StreetDispatchStatus {
  /** La mercancía está en la calle. */
  OPEN = 'OPEN',
  /** Volvió: se contó lo vendido y lo devuelto. */
  SETTLED = 'SETTLED',
  /** Se anuló y todo volvió al inventario. */
  CANCELLED = 'CANCELLED',
}

/**
 * Remisión rápida (`RRP-`): la mercancía que se le entrega a un patinador para
 * vender en la calle.
 *
 * **No es una consignación** (`consignments`, que es vender mercancía de un
 * tercero): aquí la mercancía es propia, sale del inventario y vuelve como plata
 * o como devolución. Se hizo módulo aparte justamente para no mezclar dos cosas
 * que se parecen de lejos y son opuestas.
 *
 * **Mejoras sobre el sistema anterior:**
 * - Allá el despacho se manda en **paquetes de 20 renglones** por un límite
 *   técnico del cliente; aquí va en una sola operación, en una transacción.
 * - Allá la conciliación se ve en un reporte aparte; aquí lo vendido **se
 *   convierte en una venta de verdad**, así que entra a la caja, al cierre del
 *   día y a la utilidad, sin doble digitación.
 */
@Entity('street_dispatches')
@Unique(['tenantId', 'dispatchNumber'])
export class StreetDispatch extends TenantAwareEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Consecutivo visible: `RRP-1`, `RRP-2`… */
  @Column({ name: 'dispatch_number' })
  dispatchNumber: string;

  @ManyToOne(() => StreetSeller, { eager: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'street_seller_id' })
  seller: StreetSeller;

  @Column({ name: 'street_seller_id' })
  streetSellerId: string;

  /** Bodega de la que salió la mercancía. */
  @ManyToOne(() => Warehouse, { eager: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'warehouse_id' })
  warehouse: Warehouse;

  @Column({ name: 'warehouse_id' })
  warehouseId: string;

  @Column({
    type: 'enum',
    enum: StreetDispatchStatus,
    default: StreetDispatchStatus.OPEN,
  })
  status: StreetDispatchStatus;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdById: string | null;

  @Column({ name: 'settled_by', type: 'uuid', nullable: true })
  settledById: string | null;

  @Column({ name: 'settled_at', type: 'timestamptz', nullable: true })
  settledAt: Date | null;

  /** Venta generada al conciliar (lo que el patinador vendió). */
  @Column({ name: 'sale_id', type: 'uuid', nullable: true })
  saleId: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @OneToMany(() => StreetDispatchItem, (i) => i.dispatch, { cascade: true })
  items: StreetDispatchItem[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
