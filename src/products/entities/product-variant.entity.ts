import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
  AfterLoad,
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

  /**
   * Talla y color como texto. **No son columnas**: se rellenan desde el
   * catálogo al cargar la entidad (`@AfterLoad`).
   *
   * Son propiedades reales y no getters porque los getters viven en el
   * prototipo y no son enumerables: `JSON.stringify` los omitiría y la API
   * devolvería las variantes sin talla ni color. Así el contrato hacia los
   * frontends (admin, e-commerce, bot) sigue igual que siempre, aunque por
   * dentro el dato ya viva en su catálogo.
   */
  size = '';
  color = '';

  /** Alias explícitos, para código que quiera dejar clara la procedencia. */
  get sizeName(): string {
    return this.size;
  }

  get colorName(): string {
    return this.color;
  }

  @AfterLoad()
  hydrateCatalogNames(): void {
    this.size = this.sizeRef?.name ?? '';
    this.color = this.colorRef?.name ?? '';
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
