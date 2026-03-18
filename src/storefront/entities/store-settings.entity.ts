import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';

@Entity('store_settings')
@Unique(['storeSlug'])
export class StoreSettings extends TenantAwareEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'store_name', default: '' })
  storeName: string;

  @Column({ name: 'store_slug', unique: true })
  storeSlug: string;

  @Column({ name: 'whatsapp_number', default: '' })
  whatsappNumber: string;

  @Column({ name: 'logo_url', nullable: true })
  logoUrl: string;

  @Column({ name: 'hero_logo_url', nullable: true })
  heroLogoUrl: string;

  @Column({ name: 'mini_logo_url', nullable: true })
  miniLogoUrl: string;

  @Column({ name: 'banner_url', nullable: true })
  bannerUrl: string;

  @Column({ name: 'about_text', type: 'text', nullable: true })
  aboutText: string;

  @Column({ name: 'instagram_url', nullable: true })
  instagramUrl: string;

  @Column({ name: 'facebook_url', nullable: true })
  facebookUrl: string;

  @Column({ name: 'tiktok_url', nullable: true })
  tiktokUrl: string;

  @Column({ nullable: true })
  address: string;

  @Column({ name: 'hero_title', default: '' })
  heroTitle: string;

  @Column({ name: 'hero_subtitle', default: '' })
  heroSubtitle: string;

  @Column({ name: 'accent_color', default: '#2563eb' })
  accentColor: string;

  @Column({ name: 'pos_accent_color', default: '#2563eb' })
  posAccentColor: string;

  @Column({ name: 'is_storefront_active', default: false })
  isStorefrontActive: boolean;

  @Column({ name: 'default_warehouse_id', type: 'uuid', nullable: true })
  defaultWarehouseId: string;

  @Column({ name: 'brevo_api_key', nullable: true })
  brevoApiKey: string;

  @Column({ name: 'brevo_sender_email', nullable: true })
  brevoSenderEmail: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
