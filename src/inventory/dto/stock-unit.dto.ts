import {
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsUUID,
  Min,
  ArrayMinSize,
  ValidateNested,
} from 'class-validator';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

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

export class BoxContentItemDto {
  @ApiProperty()
  @IsUUID()
  sizeId: string;

  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  quantity: number;
}

export class UpdateBoxContentsDto {
  @ApiProperty({ type: [BoxContentItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BoxContentItemDto)
  items: BoxContentItemDto[];
}
