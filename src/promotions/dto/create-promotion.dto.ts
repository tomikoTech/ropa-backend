import {
  IsString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsDateString,
  IsBoolean,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DiscountType } from '../../common/enums/discount-type.enum.js';

export class CreatePromotionDto {
  @ApiProperty({ example: 'Descuento de Temporada' })
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: DiscountType })
  @IsEnum(DiscountType)
  discountType: DiscountType;

  @ApiProperty({ example: 15 })
  @IsNumber()
  @Min(0)
  discountValue: number;

  @ApiPropertyOptional({ example: 'ALL', description: 'ALL | CATEGORY | PRODUCT' })
  @IsOptional()
  @IsString()
  applicableTo?: string;

  @ApiPropertyOptional({ description: 'UUID de categoría o producto' })
  @IsOptional()
  @IsString()
  applicableId?: string;

  @ApiProperty({ example: '2026-03-01T00:00:00Z' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2026-03-31T23:59:59Z' })
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @IsNumber()
  maxUses?: number;
}
