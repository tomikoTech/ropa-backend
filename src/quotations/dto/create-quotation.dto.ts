import {
  IsString,
  IsOptional,
  IsUUID,
  IsArray,
  ValidateNested,
  IsNumber,
  IsBoolean,
  Min,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

export class QuotationItemDto {
  @IsUUID()
  variantId: string;

  @IsNumber()
  @Min(1)
  quantity: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  discountPercent?: number;

  // Precio unitario cotizado (opcional). Si se omite, usa el precio de la variante.
  @IsNumber()
  @Min(0)
  @IsOptional()
  unitPrice?: number;
}

export class CreateQuotationDto {
  @IsUUID()
  @IsOptional()
  clientId?: string;

  @IsUUID()
  warehouseId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuotationItemDto)
  @ArrayMinSize(1)
  items: QuotationItemDto[];

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  expiresAt?: string;

  // Aplica IVA de la tienda a la cotización (default: config del tenant).
  @IsBoolean()
  @IsOptional()
  applyTax?: boolean;
}
