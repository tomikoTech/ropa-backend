import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RenglonDeTrasladoDto {
  @ApiProperty({ example: 'uuid-variante' })
  @IsUUID()
  variantId: string;

  @ApiProperty({ example: 5 })
  @IsInt()
  @Min(1)
  quantity: number;

  /** El bulto escaneado —esa caja, ese par— que va en este renglón. */
  @ApiPropertyOptional({ example: 'uuid-del-bulto' })
  @IsOptional()
  @IsUUID()
  stockUnitId?: string;
}

/**
 * Una remisión con varios renglones: cajas y pares escaneados, o tallas con
 * cantidad, todos de la misma bodega a la misma bodega y con un solo número.
 */
export class TrasladoEnLoteDto {
  @ApiProperty({ example: 'uuid-bodega-origen' })
  @IsUUID()
  fromWarehouseId: string;

  @ApiProperty({ example: 'uuid-bodega-destino' })
  @IsUUID()
  toWarehouseId: string;

  @ApiProperty({ type: [RenglonDeTrasladoDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RenglonDeTrasladoDto)
  items: RenglonDeTrasladoDto[];

  @ApiPropertyOptional({ example: 'Reposición del sábado' })
  @IsOptional()
  @IsString()
  notes?: string;

  /** Igual que en `TransferStockDto`: si no viene, decide el ajuste. */
  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  requireConfirmation?: boolean;
}
