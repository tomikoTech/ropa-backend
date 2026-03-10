import { IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TransferStockDto {
  @ApiProperty({ example: 'uuid-variante' })
  @IsUUID()
  variantId: string;

  @ApiProperty({ example: 'uuid-bodega-origen' })
  @IsUUID()
  fromWarehouseId: string;

  @ApiProperty({ example: 'uuid-bodega-destino' })
  @IsUUID()
  toWarehouseId: string;

  @ApiProperty({ example: 5 })
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiPropertyOptional({ example: 'Traslado para reposición de tienda' })
  @IsOptional()
  @IsString()
  notes?: string;
}
