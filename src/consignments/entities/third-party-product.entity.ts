import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';

/**
 * Un producto de tercero que ya se vendio alguna vez.
 *
 * No es inventario: no tiene existencias ni bodega, porque quien revende no
 * tiene bodega. Es una **libreta**: lo que se vendio antes, para no volver a
 * escribirlo. Se crea sola al registrar la venta.
 *
 * `clave` es la de `producto-de-tercero.ts` —dueno, descripcion, talla y
 * color, normalizados— y es unica por tienda: la misma libreta no puede tener
 * dos veces el mismo par.
 */
@Entity('third_party_products')
@Index(['tenantId', 'clave'], { unique: true })
export class ThirdPartyProduct extends TenantAwareEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  clave: string;

  @Column({ name: 'third_party_name' })
  thirdPartyName: string;

  @Column({ name: 'product_description' })
  productDescription: string;

  @Column({ default: '' })
  size: string;

  @Column({ default: '' })
  color: string;

  /**
   * Lo ultimo que costo y lo ultimo que se cobro.
   *
   * Lo **ultimo** y no un promedio: quien revende compra cada semana a un
   * precio distinto, y lo que sirve para la proxima venta es lo de la vez
   * pasada, no la media del ano.
   */
  @Column({
    name: 'last_cost_price',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  lastCostPrice: number;

  @Column({
    name: 'last_sale_price',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  lastSalePrice: number;

  @Column({ name: 'times_sold', type: 'int', default: 0 })
  timesSold: number;

  @Column({ name: 'last_sold_at', type: 'timestamptz', nullable: true })
  lastSoldAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
