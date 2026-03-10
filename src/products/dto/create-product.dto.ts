import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Gender } from '../../common/enums/gender.enum.js';

export class CreateVariantDto {
  @ApiProperty({ example: 'M' })
  @IsString()
  @IsNotEmpty()
  size: string;

  @ApiProperty({ example: 'Negro' })
  @IsString()
  @IsNotEmpty()
  color: string;

  @ApiPropertyOptional({ example: 55000 })
  @IsOptional()
  @IsNumber()
  priceOverride?: number;
}

export class CreateProductDto {
  @ApiProperty({ example: 'Camiseta Polo Classic' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'Camiseta polo de algodón 100%' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 49900 })
  @IsNumber()
  @Min(0)
  basePrice: number;

  @ApiProperty({ example: 25000 })
  @IsNumber()
  @Min(0)
  costPrice: number;

  @ApiPropertyOptional({ enum: Gender, default: Gender.UNISEX })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiPropertyOptional({ example: 'uuid-de-categoria' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ example: 19 })
  @IsOptional()
  @IsNumber()
  taxRate?: number;

  @ApiPropertyOptional({ example: 'https://example.com/image.jpg' })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiProperty({ type: [CreateVariantDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateVariantDto)
  variants: CreateVariantDto[];
}
