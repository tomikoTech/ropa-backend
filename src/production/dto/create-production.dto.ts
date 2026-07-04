import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ProductionItemDto {
  @ApiProperty({ example: 'uuid-variante-esencia' })
  @IsUUID()
  variantId: string;

  @ApiProperty({ example: 100, description: 'Cantidad consumida en ml' })
  @IsInt()
  @Min(1)
  quantity: number;
}

export class CreateProductionDto {
  @ApiProperty({ example: 'uuid-bodega' })
  @IsUUID()
  warehouseId: string;

  @ApiProperty({ type: [ProductionItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductionItemDto)
  @ArrayMinSize(1)
  items: ProductionItemDto[];

  @ApiPropertyOptional({
    example: 'uuid-variante-locion',
    description: 'Loción producida (opcional)',
  })
  @IsOptional()
  @IsUUID()
  producedVariantId?: string;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  producedQuantity?: number;

  @ApiPropertyOptional({ example: 'Producción del día' })
  @IsOptional()
  @IsString()
  notes?: string;
}
