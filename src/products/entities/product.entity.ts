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

  @Column({ type: 'enum', enum: Gender, default: Gender.UNISEX })
  gender: Gender;

  @ManyToOne(() => Category, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'category_id' })
  category: Category;

  @Column({ name: 'category_id', nullable: true })
  categoryId: string;

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
