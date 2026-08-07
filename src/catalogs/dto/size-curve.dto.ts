import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SizeCurveItemDto {
  @ApiProperty({ description: 'Id de la talla' })
  @IsUUID()
  sizeId: string;

  @ApiProperty({ example: 6, description: 'Unidades de esta talla por caja' })
  @IsInt()
  @Min(1)
  quantity: number;
}

export class CreateSizeCurveDto {
  @ApiProperty({ example: 'Curva DAMA 36-39' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ description: 'Familia de curvas a la que pertenece' })
  @IsOptional()
  @IsUUID()
  curveTypeId?: string;

  @ApiProperty({ type: [SizeCurveItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SizeCurveItemDto)
  items: SizeCurveItemDto[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateSizeCurveDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  curveTypeId?: string;

  @ApiPropertyOptional({ type: [SizeCurveItemDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SizeCurveItemDto)
  items?: SizeCurveItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateSizeCurveTypeDto {
  @ApiProperty({ example: 'DAMA' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateSizeCurveTypeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
