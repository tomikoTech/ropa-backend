import {
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
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

/**
 * Ingreso directo de cajas que ya están en la bodega, sin orden de compra.
 *
 * Es el caso de quien arranca con el inventario puesto: las cajas existen, el
 * proveedor ya cobró y no hay una compra que registrar. Lo que sí hay que
 * saber es qué trae cada caja, y para eso sirve la curva.
 */
export class IntakeBoxesDto {
  @ApiProperty({ description: 'Producto de las cajas' })
  @IsUUID()
  productId: string;

  @ApiPropertyOptional({ description: 'Color, si el producto lo maneja' })
  @IsOptional()
  @IsUUID()
  colorId?: string;

  @ApiPropertyOptional({
    description: 'Curva de tallas: define qué trae cada caja',
  })
  @IsOptional()
  @IsUUID()
  sizeCurveId?: string;

  @ApiProperty({ description: 'Cuántas cajas iguales entran', minimum: 1 })
  @IsInt()
  @Min(1)
  boxes: number;

  @ApiPropertyOptional({
    description:
      'Unidades por caja. Solo se usa cuando no hay curva; con curva manda el surtido.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  unitsPerBox?: number;

  @ApiProperty({ description: 'Bodega donde quedan las cajas' })
  @IsUUID()
  warehouseId: string;

  @ApiPropertyOptional({ description: 'Estante o ubicación dentro de la bodega' })
  @IsOptional()
  @IsUUID()
  standId?: string;

  @ApiPropertyOptional({ description: 'Costo por unidad puesto en bodega' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  unitCost?: number;

  @ApiPropertyOptional({ description: 'Por qué entran (queda en el historial)' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;
}

/**
 * Traslado de cajas o pares etiquetados entre bodegas.
 *
 * El traslado de siempre mueve el inventario agregado por variante y **no
 * toca el bulto**: la caja se quedaba figurando en la bodega de origen, que
 * quedaba con cero unidades y una caja encima que ya no se podía abrir. Acá se
 * mueven las dos cosas juntas, que es lo que pasa en la realidad cuando
 * alguien carga la caja en el camión.
 */
export class TransferUnitsDto {
  @ApiProperty({ type: [String], description: 'Bultos a trasladar' })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  ids: string[];

  @ApiProperty({ description: 'Bodega a la que llega la mercancía' })
  @IsUUID()
  toWarehouseId: string;

  @ApiPropertyOptional({ description: 'Estante dentro de la bodega destino' })
  @IsOptional()
  @IsUUID()
  toStandId?: string;

  @ApiPropertyOptional({ description: 'Por qué se traslada' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;
}
