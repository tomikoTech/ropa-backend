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
import { Category } from '../../categories/entities/category.entity.js';
import { ProductVariant } from './product-variant.entity.js';
import { Gender } from '../../common/enums/gender.enum.js';
import { ProductStatus } from '../../common/enums/product-status.enum.js';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';

@Entity('products')
@Unique(['tenantId', 'skuPrefix'])
@Unique(['tenantId', 'slug'])
export class Product extends TenantAwareEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ name: 'sku_prefix' })
  skuPrefix: string;

  @Column({ nullable: true })
  slug: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ name: 'base_price', type: 'decimal', precision: 12, scale: 2 })
  basePrice: number;

  @Column({
    name: 'cost_price',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  costPrice: number;

  // Precio al por mayor (opcional). Para vender a otros puntos/revendedores.
  // Se usa en el POS con el modo "Mayorista". null = no definido.
  @Column({
    name: 'wholesale_price',
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  wholesalePrice: number | null;

  /** Precio efectivo mínimo permitido en POS. null = sin restricción. */
  @Column({
    name: 'minimum_sale_price',
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  minimumSalePrice: number | null;

  /**
   * El precio no se negocia.
   *
   * Distinto del mínimo, que es un piso: aquí subirlo también está prohibido,
   * y no admite descuento. «Las cajas que yo vendo, si tienen un precio, eso
   * no tiene descuento para nadie».
   *
   * Apagado por defecto: en calzado el precio casi siempre se negocia.
   */
  @Column({ name: 'fixed_price', type: 'boolean', default: false })
  fixedPrice: boolean;

  @Column({ type: 'enum', enum: Gender, default: Gender.UNISEX })
  gender: Gender;

  @ManyToOne(() => Category, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'category_id' })
  category: Category;

  @Column({ name: 'category_id', nullable: true })
  categoryId: string;

  // Frasco (variante) que consume este producto al venderse. Usado en
  // perfumería: al vender 1 loción se descuenta también 1 de este frasco.
  @Column({ name: 'frasco_variant_id', type: 'uuid', nullable: true })
  frascoVariantId: string | null;

  @Column({
    type: 'enum',
    enum: ProductStatus,
    default: ProductStatus.ACTIVE,
  })
  status: ProductStatus;

  @Column({
    name: 'tax_rate',
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 19,
  })
  taxRate: number;

  @Column({ name: 'display_name', nullable: true })
  displayName: string;

  // Marca del producto (ej. NIKE, ADIDAS). MiPinta no la tenía; se agregó para
  // la migración desde demachine (Sportcali), que sí maneja marca por producto.
  @Column({ nullable: true })
  brand: string;

  // Referencia de procedencia para migraciones/re-sync idempotentes.
  // Formato: "<sistema>:<instancia>:<id>" (ej. "demachine:sportcali:534").
  /**
   * Si este producto se etiqueta par por par, con su código único impreso.
   *
   * Tres estados, y el producto manda sobre la tienda:
   *   - `true`  → se etiqueta, diga lo que diga la tienda
   *   - `false` → **no** se etiqueta, diga lo que diga la tienda
   *   - `null`  → lo que diga `StoreSettings.unitTrackingEnabled`
   *
   * `false` era antes lo mismo que `null` —la regla era un `OR`—, así que un
   * producto no podía decir que no. Daba igual mientras el interruptor de la
   * tienda estuviera apagado por defecto; al encenderlo para todas, una
   * esencia de perfumería que se mide en gramos habría recibido una etiqueta
   * por gramo. La regla vive en `inventory/ledger/lleva-unidades.ts`.
   */
  @Column({ name: 'unit_tracking', type: 'boolean', nullable: true })
  unitTracking: boolean | null;

  @Column({ name: 'source_ref', nullable: true })
  sourceRef: string;

  // Lote / pedido al que pertenece el producto (etiqueta libre, ej. un pedido
  // de compra o una carga). Para reportes "cuánto queda del pedido de X".
  @Column({ nullable: true })
  lote: string;

  @Column({ name: 'image_url', nullable: true })
  imageUrl: string;

  @Column({ name: 'image_urls', type: 'text', array: true, default: '{}' })
  imageUrls: string[];

  @Column({ name: 'video_url', nullable: true })
  videoUrl: string;

  @Column({ name: 'is_published', default: false })
  isPublished: boolean;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt: Date;

  // Disponibilidad a nivel producto, independiente del stock por unidad.
  // Tenants sin control de inventario (p.ej. the-culture) usan solo esta
  // bandera: `available` = isPublished && isAvailable. Marcar false = agotado.
  @Column({ name: 'is_available', default: true })
  isAvailable: boolean;

  // Override manual de "punta" (F2). null = decide el criterio automático
  // (antigüedad + tallas restantes); true/false = forzado por el admin.
  @Column({ name: 'is_leftover', type: 'boolean', nullable: true })
  isLeftover?: boolean | null;

  /**
   * Cuántos pares de esta referencia deben estar en la vitrina.
   *
   * `null` = lo que diga la tienda en general. `0` **no** es lo mismo: es la
   * decisión de no exhibir esta referencia. Las cajas de cartón y los
   * accesorios no van en vitrina, y sin poder decirlo la lista de «falta por
   * exhibir» se llena de cosas que nadie va a exhibir nunca y termina siendo
   * ruido que se ignora.
   *
   * Es por referencia y no por talla porque en vitrina va **un par del
   * modelo**, no uno de cada talla.
   */
  @Column({ name: 'exhibicion_objetivo', type: 'int', nullable: true })
  exhibicionObjetivo: number | null;

  @OneToMany(() => ProductVariant, (v) => v.product, {
    cascade: true,
    eager: false,
  })
  variants: ProductVariant[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
