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

@Entity('categories')
@Unique(['tenantId', 'name'])
@Unique(['tenantId', 'slug'])
export class Category extends TenantAwareEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ name: 'display_name', nullable: true })
  displayName: string;

  @Column()
  slug: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @ManyToOne(() => Category, (cat) => cat.children, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'parent_id' })
  parent: Category | null;

  @Column({ name: 'parent_id', nullable: true })
  parentId: string | null;

  @OneToMany(() => Category, (cat) => cat.parent)
  children: Category[];

  @Column({ name: 'sort_order', default: 0 })
  sortOrder: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'is_published', default: false })
  isPublished: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
