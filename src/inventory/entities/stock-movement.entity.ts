import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  CreateDateColumn,
  BeforeInsert,
  BeforeUpdate,
} from 'typeorm';
import { ProductVariant } from '../../products/entities/product-variant.entity.js';
import { Warehouse } from './warehouse.entity.js';
import { User } from '../../users/entities/user.entity.js';
import { MovementType } from '../../common/enums/movement-type.enum.js';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';
import { normalizeStoredQuantity } from '../movement-delta.js';

// Cuánto sigue descontado por un documento: lo lee cada anulación y cada
// edición de factura, dentro de la transacción y con el stock bloqueado.
@Index(['tenantId', 'referenceType', 'referenceId'])
@Entity('stock_movements')
export class StockMovement extends TenantAwareEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ProductVariant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'variant_id' })
  variant: ProductVariant;

  @Column({ name: 'variant_id' })
  variantId: string;

  @ManyToOne(() => Warehouse, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'warehouse_id' })
  warehouse: Warehouse;

  @Column({ name: 'warehouse_id' })
  warehouseId: string;

  @Column({
    name: 'movement_type',
    type: 'enum',
    enum: MovementType,
  })
  movementType: MovementType;

  @Column({ type: 'int' })
  quantity: number;

  @Column({ name: 'reference_type', nullable: true })
  referenceType: string;

  @Column({ name: 'reference_id', nullable: true })
  referenceId: string;

  @Column({ nullable: true })
  notes: string;

  /**
   * Los códigos de los pares o cajas que movió esta operación.
   *
   * Es el código impreso en la caja, el que la tienda busca en la bodega. El
   * de la variante ya está en el producto y es el mismo para todos los pares
   * de esa talla: para saber **cuál** se fue, hace falta este.
   *
   * Nulo cuando el producto no lleva seguimiento por unidad (una perfumería
   * que vende por gramos) o cuando el agregado iba por delante de las
   * etiquetas —eso último queda además dicho en `notes`—.
   */
  @Column({ name: 'unit_barcodes', type: 'text', array: true, nullable: true })
  unitBarcodes: string[] | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  createdBy: User;

  @Column({ name: 'created_by', nullable: true })
  createdById: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  /**
   * El signo lo pone la entidad, no quien registra el movimiento.
   *
   * Durante meses la misma salida quedó guardada de dos formas —el POS la
   * escribía `-8` y compras, producción, recetas, conteos, calle, devoluciones
   * y el ajuste rápido la escribían `9`—, porque cada uno dejaba que su propio
   * `switch` hiciera la resta sobre el stock. Sumar la columna daba un número
   * sin sentido y el historial mostraba las salidas como entradas.
   *
   * Corregir las ocho llamadas habría dejado el problema listo para volver en
   * el noveno módulo. Acá queda cubierto el que ya existe y el que venga.
   */
  @BeforeInsert()
  @BeforeUpdate()
  normalizarSigno() {
    if (this.movementType == null || this.quantity == null) return;
    this.quantity = normalizeStoredQuantity(this.movementType, this.quantity);
  }
}
