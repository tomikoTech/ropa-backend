import { IsString, IsOptional, IsBoolean, IsUUID, IsNumber, IsIn, Min, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateStoreSettingsDto {
  @ApiPropertyOptional({ example: 'Mi Tienda' })
  @IsOptional()
  @IsString()
  storeName?: string;

  @ApiPropertyOptional({ example: '573001234567' })
  @IsOptional()
  @IsString()
  whatsappNumber?: string;

  @ApiPropertyOptional({ example: 'https://example.com/logo.png' })
  @IsOptional()
  @IsString()
  logoUrl?: string;

  @ApiPropertyOptional({ example: 'https://example.com/hero-logo.png' })
  @IsOptional()
  @IsString()
  heroLogoUrl?: string;

  @ApiPropertyOptional({ example: 'https://example.com/mini-logo.png' })
  @IsOptional()
  @IsString()
  miniLogoUrl?: string;

  @ApiPropertyOptional({ example: 'https://example.com/navbar-logo.png' })
  @IsOptional()
  @IsString()
  navbarLogoUrl?: string;

  @ApiPropertyOptional({ example: 'https://example.com/banner.jpg' })
  @IsOptional()
  @IsString()
  bannerUrl?: string;

  @ApiPropertyOptional({ example: 'Somos una tienda de ropa...' })
  @IsOptional()
  @IsString()
  aboutText?: string;

  @ApiPropertyOptional({ example: 'https://instagram.com/mitienda' })
  @IsOptional()
  @IsString()
  instagramUrl?: string;

  @ApiPropertyOptional({ example: 'https://facebook.com/mitienda' })
  @IsOptional()
  @IsString()
  facebookUrl?: string;

  @ApiPropertyOptional({ example: 'https://tiktok.com/@mitienda' })
  @IsOptional()
  @IsString()
  tiktokUrl?: string;

  @ApiPropertyOptional({ example: 'Calle 100 #15-20, Bogotá' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: 'Bienvenidos a nuestra tienda' })
  @IsOptional()
  @IsString()
  heroTitle?: string;

  @ApiPropertyOptional({ example: 'Las mejores prendas al mejor precio' })
  @IsOptional()
  @IsString()
  heroSubtitle?: string;

  @ApiPropertyOptional({ example: '#2563eb' })
  @IsOptional()
  @IsString()
  accentColor?: string;

  @ApiPropertyOptional({ example: '#2563eb' })
  @IsOptional()
  @IsString()
  posAccentColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isStorefrontActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  defaultWarehouseId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  ecommerceWarehouseId?: string;

  @ApiPropertyOptional({ example: 'xkeysib-...' })
  @IsOptional()
  @IsString()
  brevoApiKey?: string;

  @ApiPropertyOptional({ example: 'mipinta.shop@gmail.com' })
  @IsOptional()
  @IsString()
  brevoSenderEmail?: string;

  @ApiPropertyOptional({ example: 'wava_mk_...' })
  @IsOptional()
  @IsString()
  wavaMerchantKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  codEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Require shipping payment upfront for COD' })
  @IsOptional()
  @IsBoolean()
  codRequireShippingUpfront?: boolean;

  @ApiPropertyOptional({ description: 'Percentage of product total to pay upfront as abono', example: 10 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  codUpfrontPercentage?: number;

  @ApiPropertyOptional({ description: 'COD surcharge type', enum: ['percentage', 'fixed'], example: 'percentage' })
  @IsOptional()
  @IsIn(['percentage', 'fixed'])
  codSurchargeType?: string;

  @ApiPropertyOptional({ description: 'COD surcharge value (amount or percentage)', example: 5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  codSurchargeValue?: number;

  @ApiPropertyOptional({ description: 'Flat shipping cost for all deliveries', example: 30000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  flatShippingCost?: number;

  @ApiPropertyOptional({ example: 8000 })
  @IsOptional()
  @IsNumber()
  shippingCostLocal?: number;

  @ApiPropertyOptional({ example: 15000 })
  @IsOptional()
  @IsNumber()
  shippingCostNational?: number;

  @ApiPropertyOptional({ example: 200000 })
  @IsOptional()
  @IsNumber()
  freeShippingThreshold?: number;

  @ApiPropertyOptional({ example: 'Bogotá' })
  @IsOptional()
  @IsString()
  storeCityName?: string;

  @ApiPropertyOptional({ example: 12000 })
  @IsOptional()
  @IsNumber()
  shippingCostRegional?: number;

  @ApiPropertyOptional({ example: 'Cundinamarca' })
  @IsOptional()
  @IsString()
  storeDepartment?: string;

  @ApiPropertyOptional({ example: 20000 })
  @IsOptional()
  @IsNumber()
  maxShippingCost?: number;

  @ApiPropertyOptional({ description: 'Custom hero HTML (developer-managed)' })
  @IsOptional()
  @IsString()
  customHeroHtml?: string;

  @ApiPropertyOptional({ description: 'Google Font family name', example: 'Playfair Display' })
  @IsOptional()
  @IsString()
  storeFontFamily?: string;

  @ApiPropertyOptional({ description: 'Apply custom font to hero section' })
  @IsOptional()
  @IsBoolean()
  fontApplyHero?: boolean;

  @ApiPropertyOptional({ description: 'Apply custom font to product cards/details' })
  @IsOptional()
  @IsBoolean()
  fontApplyProducts?: boolean;

  @ApiPropertyOptional({ description: 'Apply custom font to navbar' })
  @IsOptional()
  @IsBoolean()
  fontApplyNavbar?: boolean;

  @ApiPropertyOptional({ description: 'Custom navigation items', type: 'array' })
  @IsOptional()
  navItems?: { label: string; href: string }[];

  @ApiPropertyOptional({ description: 'Store theme: dark or light', example: 'light' })
  @IsOptional()
  @IsString()
  storeTheme?: string;

  @ApiPropertyOptional({ description: 'Custom background color hex (overrides theme)', example: '#ffcc01' })
  @IsOptional()
  @IsString()
  storeBgColor?: string;

  @ApiPropertyOptional({ description: 'Dominio personalizado (ej: theculture.co)', example: 'theculture.co' })
  @IsOptional()
  @IsString()
  customDomain?: string;

  @ApiPropertyOptional({ description: 'Wompi public key', example: 'pub_prod_xxx' })
  @IsOptional()
  @IsString()
  wompiPublicKey?: string;

  @ApiPropertyOptional({ description: 'Wompi private key', example: 'prv_prod_xxx' })
  @IsOptional()
  @IsString()
  wompiPrivateKey?: string;

  @ApiPropertyOptional({ description: 'Wompi integrity secret', example: 'prod_integrity_xxx' })
  @IsOptional()
  @IsString()
  wompiIntegritySecret?: string;

  @ApiPropertyOptional({ description: 'Wompi events secret', example: 'prod_events_xxx' })
  @IsOptional()
  @IsString()
  wompiEventsSecret?: string;
}
