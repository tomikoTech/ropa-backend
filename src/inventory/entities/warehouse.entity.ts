import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';

@Entity('warehouses')
@Unique(['tenantId', 'name'])
@Unique(['tenantId', 'code'])
export class Warehouse extends TenantAwareEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  code: string;

  @Column({ type: 'text', nullable: true })
  address: string;

  @Column({ name: 'is_pos_location', default: false })
  isPosLocation: boolean;

  /**
   * Esta bodega es la **vitrina**: lo que está a la vista del cliente.
   *
   * Es una bodega y no una tabla aparte a propósito. En la aplicación que usa
   * un dueño de tres locales la exhibición vive en otro inventario, y por eso
   * «si yo voy a hacer una venta múltiple de cuatro pares y una es la
   * exhibición, primero tengo que reportar los tres y después tengo que
   * reportar la exhibición». Siendo una bodega más, la cascada de la venta la
   * toma en el mismo ticket sin que nadie reporte nada aparte.
   *
   * Lo único que cambia es el orden: la muestra se descuenta de última (ver
   * `exhibicion.ts`).
   */
  @Column({ name: 'is_exhibition', default: false })
  isExhibition: boolean;

  /**
   * De qué local es esta vitrina.
   *
   * Es de donde sale la mercancía para reponer la muestra cuando se vende. Sin
   * esto, «falta por exhibir» no sabría a quién pedirle el par.
   */
  @Column({ name: 'exhibition_of_warehouse_id', type: 'uuid', nullable: true })
  exhibitionOfWarehouseId: string | null;

  /**
   * La bodega **principal** de la tienda: de donde sale casi todo.
   *
   * Una sola por tienda, garantizado por un índice parcial y no por convención
   * (ver la migración). Dos principales dejarían el préstamo entre locales sin
   * centro, y nadie sabría contra quién se cuadra.
   */
  @Column({ name: 'is_main', default: false })
  isMain: boolean;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
