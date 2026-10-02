import { IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Producción simple de una perfumería, en dos pasos separados a propósito:
 * César saca esencia; Andrea registra las lociones terminadas. Ver la
 * cabecera de `ProductionService.sacarEsencia` y `entrarTerminado`.
 */
export class SalidaDeEsenciaDto {
  @ApiProperty({ description: 'La variante de la esencia' })
  @IsUUID()
  variantId: string;

  @ApiProperty({ example: 2300, description: 'Gramos que se sacan' })
  @IsInt()
  @Min(1)
  gramos: number;

  @ApiPropertyOptional({
    description: 'Bodega; sin ella, la que tiene la esencia',
  })
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @ApiPropertyOptional({ example: 'Para 50 Good Girl' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class EntradaDeTerminadoDto {
  @ApiProperty({ description: 'La variante de la loción terminada' })
  @IsUUID()
  variantId: string;

  @ApiProperty({ example: 10, description: 'Lociones que llegaron terminadas' })
  @IsInt()
  @Min(1)
  cantidad: number;

  @ApiPropertyOptional({
    description: 'Bodega de venta; sin ella, la principal de la tienda',
  })
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @ApiPropertyOptional({
    example: 0,
    description: 'De las que llegaron, cuántas salieron malas',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  averiadas?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
