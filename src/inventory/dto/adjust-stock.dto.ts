import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MovementType } from '../../common/enums/movement-type.enum.js';

export class AdjustStockDto {
  @ApiProperty({ example: 'uuid-variante' })
  @IsUUID()
  variantId: string;

  @ApiProperty({ example: 'uuid-bodega' })
  @IsUUID()
  warehouseId: string;

  @ApiProperty({ example: 10 })
  @IsInt()
  quantity: number;

  @ApiProperty({
    enum: [MovementType.IN, MovementType.OUT, MovementType.ADJUSTMENT],
  })
  @IsEnum(MovementType)
  movementType: MovementType;

  @ApiPropertyOptional({ example: 'Ajuste de inventario inicial' })
  @IsOptional()
  @IsString()
  notes?: string;

  // Perfumería: solo si es TRUE y se agregan unidades de un producto con
  // receta, se descuenta la esencia (= producción). Por defecto FALSE, para
  // que cargar inventario inicial/conteos/correcciones NO toque las esencias.
  @ApiPropertyOptional({
    example: false,
    description: 'Descontar esencia por receta (producción). Default false.',
  })
  @IsOptional()
  @IsBoolean()
  consumeEssence?: boolean;
}
