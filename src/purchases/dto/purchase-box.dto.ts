import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
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

export class CreateBoxLineDto {
  @ApiProperty()
  @IsUUID()
  productId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  colorId?: string;

  @ApiPropertyOptional({ description: 'Curva de tallas de la caja' })
  @IsOptional()
  @IsUUID()
  sizeCurveId?: string;

  @ApiProperty({ example: 10, description: 'Número de cajas' })
  @IsInt()
  @Min(1)
  boxes: number;

  @ApiProperty({ example: 24, description: 'Unidades (pares) por caja' })
  @IsInt()
  @Min(1)
  unitsPerBox: number;

  @ApiProperty({ description: 'Costo unitario en moneda del proveedor' })
  @IsNumber()
  @Min(0)
  unitCost: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  salePrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comment?: string;
}

export class UpdateBoxLineDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  boxes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  unitsPerBox?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  unitCost?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  salePrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  sizeCurveId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comment?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class FreightCostDto {
  @ApiProperty({ example: 'Naviera' })
  @IsString()
  @IsNotEmpty()
  label: string;

  @ApiProperty({ example: 1200000 })
  @IsNumber()
  @Min(0)
  amount: number;
}

export class UpdateImportCostsDto {
  @ApiPropertyOptional({ example: 4000, description: 'Tasa de cambio' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  exchangeRate?: number;

  @ApiPropertyOptional({ type: [FreightCostDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FreightCostDto)
  freightCosts?: FreightCostDto[];

  @ApiPropertyOptional({ enum: ['BY_UNITS', 'BY_VALUE'] })
  @IsOptional()
  @IsIn(['BY_UNITS', 'BY_VALUE'])
  freightAllocation?: 'BY_UNITS' | 'BY_VALUE';

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  arrivalDate?: string | null;
}
