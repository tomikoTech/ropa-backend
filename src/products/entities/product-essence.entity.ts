import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { Product } from './product.entity.js';
import { ProductVariant } from './product-variant.entity.js';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';

// Receta (lista de materiales) de un producto final: qué esencias y cuántos
// gramos de cada una se consumen por CADA unidad producida. Relación
// muchos-a-muchos entre productos finales y variantes de esencia: una esencia
// puede alimentar muchos productos y un producto puede usar muchas esencias.
@Entity('product_essences')
@Unique(['tenantId', 'productId', 'essenceVariantId'])
export class ProductEssence extends TenantAwareEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column({ name: 'product_id' })
  productId: string;

  // Variante de esencia consumida (el stock es por variante).
  @ManyToOne(() => ProductVariant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'essence_variant_id' })
  essenceVariant: ProductVariant;

  @Column({ name: 'essence_variant_id' })
  essenceVariantId: string;

  // Gramos de esta esencia por unidad de producto final. Decimal para permitir
  // recetas fraccionadas (p.ej. 2.5 g por unidad).
  @Column({
    name: 'grams_per_unit',
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
  })
  gramsPerUnit: number;
}
