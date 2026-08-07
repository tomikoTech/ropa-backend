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
   * Talla y color: la **fuente de verdad es la FK** (`sizeId` / `colorId`).
   *
   * Las relaciones son `eager` a propósito: son tablas de consulta pequeñas
   * (decenas de filas por tenant) que casi siempre se necesitan al mostrar una
   * variante, así que cargarlas evita N+1 sin costo real.
   *
   * Las columnas de texto `size`/`color` se conservan **solo durante la
   * migración** (patrón expand-migrate-contract) para que el backend anterior
   * siga funcionando mientras se despliega. Se eliminan en el paso final; no
   * escribir lógica nueva contra ellas: usar `sizeName` / `colorName`.
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

  /** @deprecated Se elimina al terminar la migración. Usar `sizeName`. */
  @Column({ nullable: true, default: '' })
  size: string;

  /** @deprecated Se elimina al terminar la migración. Usar `colorName`. */
  @Column({ nullable: true, default: '' })
  color: string;

  /** Nombre de la talla desde el catálogo, con respaldo en el texto heredado. */
  get sizeName(): string {
    return this.sizeRef?.name ?? this.size ?? '';
  }

  /** Nombre del color desde el catálogo, con respaldo en el texto heredado. */
  get colorName(): string {
    return this.colorRef?.name ?? this.color ?? '';
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
