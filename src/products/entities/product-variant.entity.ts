import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';
import { Product } from './product.entity.js';
import { Size } from '../../catalogs/entities/size.entity.js';
import { Color } from '../../catalogs/entities/color.entity.js';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';

@Entity('product_variants')
@Unique(['tenantId', 'sku'])
@Unique(['tenantId', 'barcode'])
export class ProductVariant extends TenantAwareEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Product, (p) => p.variants, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column({ name: 'product_id' })
  productId: string;

  @Column()
  sku: string;

  /**
   * Talla y color viven en su catálogo; aquí solo la referencia.
   *
   * Las relaciones son `eager` a propósito: son tablas de consulta pequeñas
   * (decenas de filas por tenant) que casi siempre se necesitan al mostrar una
   * variante, así que cargarlas evita N+1 sin costo real.
   *
   * Para leer el nombre usar `sizeName` / `colorName`.
   *
   * Ojo: los **documentos** (SaleItem, EcommerceOrderItem) sí guardan el texto
   * como snapshot histórico, y eso es correcto: si mañana se renombra la talla,
   * la venta de ayer debe seguir diciendo cómo se llamaba entonces.
   */
  @ManyToOne(() => Size, { nullable: true, onDelete: 'RESTRICT', eager: true })
  @JoinColumn({ name: 'size_id' })
  sizeRef: Size | null;

  @Column({ name: 'size_id', type: 'uuid', nullable: true })
  sizeId: string | null;

  @ManyToOne(() => Color, { nullable: true, onDelete: 'RESTRICT', eager: true })
  @JoinColumn({ name: 'color_id' })
  colorRef: Color | null;

  @Column({ name: 'color_id', type: 'uuid', nullable: true })
  colorId: string | null;

  /** Nombre de la talla ('' si la variante no tiene). */
  get sizeName(): string {
    return this.sizeRef?.name ?? '';
  }

  /** Nombre del color ('' si la variante no tiene). */
  get colorName(): string {
    return this.colorRef?.name ?? '';
  }

  /**
   * Expone `size` y `color` como texto en el JSON de la API.
   *
   * Hace falta porque los getters de clase viven en el prototipo y no son
   * enumerables: `JSON.stringify` los ignoraría, y las respuestas se quedarían
   * sin talla ni color. El contrato hacia los frontends (admin, e-commerce,
   * bot) sigue siendo el mismo de siempre, aunque por dentro ya sea una FK.
   */
  toJSON() {
    return {
      ...this,
      size: this.sizeName,
      color: this.colorName,
    };
  }

  @Column({ nullable: true })
  barcode: string;

  @Column({
    name: 'price_override',
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  priceOverride: number | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
