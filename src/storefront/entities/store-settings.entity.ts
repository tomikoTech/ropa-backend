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

  @Column({ name: 'ecommerce_warehouse_id', type: 'uuid', nullable: true })
  ecommerceWarehouseId: string;

  @Column({ name: 'brevo_api_key', nullable: true })
  brevoApiKey: string;

  @Column({ name: 'brevo_sender_email', nullable: true })
  brevoSenderEmail: string;

  @Column({ name: 'wava_merchant_key', nullable: true })
  wavaMerchantKey: string;

  @Column({ name: 'cod_enabled', default: false })
  codEnabled: boolean;

  @Column({ name: 'cod_require_shipping_upfront', default: false })
  codRequireShippingUpfront: boolean;

  @Column({
    name: 'cod_upfront_percentage',
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 0,
  })
  codUpfrontPercentage: number;

  @Column({ name: 'cod_surcharge_type', nullable: true })
  codSurchargeType: string;

  @Column({
    name: 'cod_surcharge_value',
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: 0,
  })
  codSurchargeValue: number;

  @Column({
    name: 'shipping_cost_local',
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: 0,
  })
  shippingCostLocal: number;

  @Column({
    name: 'shipping_cost_national',
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: 0,
  })
  shippingCostNational: number;

  @Column({
    name: 'free_shipping_threshold',
    type: 'decimal',
    precision: 14,
    scale: 2,
    nullable: true,
  })
  freeShippingThreshold: number;

  @Column({ name: 'store_city_name', nullable: true })
  storeCityName: string;

  @Column({
    name: 'shipping_cost_regional',
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: 0,
  })
  shippingCostRegional: number;

  @Column({ name: 'store_department', nullable: true })
  storeDepartment: string;

  @Column({
    name: 'max_shipping_cost',
    type: 'decimal',
    precision: 14,
    scale: 2,
    nullable: true,
  })
  maxShippingCost: number;

  @Column({ name: 'custom_hero_html', type: 'text', nullable: true })
  customHeroHtml: string;

  @Column({ name: 'store_font_family', nullable: true })
  storeFontFamily: string;

  @Column({ name: 'font_apply_hero', type: 'boolean', default: true })
  fontApplyHero: boolean;

  @Column({ name: 'font_apply_products', type: 'boolean', default: false })
  fontApplyProducts: boolean;

  @Column({ name: 'font_apply_navbar', type: 'boolean', default: false })
  fontApplyNavbar: boolean;

  @Column({ name: 'nav_items', type: 'jsonb', nullable: true })
  navItems: { label: string; href: string }[] | null;

  @Column({ name: 'store_theme', default: 'dark' })
  storeTheme: string;

  @Column({ name: 'store_bg_color', nullable: true })
  storeBgColor: string;

  @Column({
    name: 'flat_shipping_cost',
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: 30000,
  })
  flatShippingCost: number;

  @Column({ name: 'custom_domain', nullable: true, unique: true })
  customDomain: string;

  @Column({ name: 'wompi_public_key', nullable: true })
  wompiPublicKey: string;

  @Column({ name: 'wompi_private_key', nullable: true })
  wompiPrivateKey: string;

  @Column({ name: 'wompi_integrity_secret', nullable: true })
  wompiIntegritySecret: string;

  @Column({ name: 'wompi_events_secret', nullable: true })
  wompiEventsSecret: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
