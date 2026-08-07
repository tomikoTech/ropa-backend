import {
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';

export class ReceiveBoxesDto {
  @ApiPropertyOptional({
    description:
      'Cajas a recibir. Si se omite, se reciben todas las pendientes.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  boxes?: number;

  @ApiPropertyOptional({
    description: 'Bodega destino; por defecto la de la orden',
  })
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @ApiPropertyOptional({ description: 'Stand donde queda la mercancía' })
  @IsOptional()
  @IsUUID()
  standId?: string;

  @ApiPropertyOptional({
    description:
      'Costo puesto en bodega por unidad (del cálculo de landed cost)',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  landedUnitCost?: number;
}

export class MarkPrintedDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsUUID('4', { each: true })
  ids: string[];
}
