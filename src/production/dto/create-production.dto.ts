import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ProductionItemDto {
  @ApiProperty({ example: 'uuid-variante-esencia' })
  @IsUUID()
  variantId: string;

  @ApiProperty({ example: 100, description: 'Cantidad consumida (g)' })
  @IsInt()
  @Min(1)
  quantity: number;
}

export class CreateProductionDto {
  @ApiProperty({ example: 'uuid-bodega' })
  @IsUUID()
  warehouseId: string;

  // Consumo manual de esencias (legacy / opcional). Si el producto final
  // tiene receta, la producción consume según la receta y este arreglo se
  // ignora. Se mantiene para productos sin receta.
  @ApiPropertyOptional({ type: [ProductionItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductionItemDto)
  items?: ProductionItemDto[];

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
