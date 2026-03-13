import { IsEnum, IsInt, IsOptional, IsString, IsUUID } from 'class-validator';
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
}
