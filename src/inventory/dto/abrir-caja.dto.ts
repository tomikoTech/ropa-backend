import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

/** Cuántos pares de una talla salen de la caja. */
export class ParesDeUnaTallaDto {
  @IsUUID()
  sizeId!: string;

  @IsInt()
  @Min(0)
  quantity!: number;

  @ApiPropertyOptional({
    description:
      'A qué bodega van estos pares. Sin esto, la de la caja (o la general).',
  })
  @IsOptional()
  @IsUUID()
  warehouseId?: string;
}

/**
 * Abrir una caja.
 *
 * Sin cuerpo se abre entera, que es lo de siempre. Con `items` salen solo esos
 * pares y la caja se queda con el resto.
 */
export class AbrirCajaDto {
  @ApiPropertyOptional({
    description:
      'Bodega a la que van los pares que no digan la suya. Sin esto se quedan ' +
      'donde está la caja.',
  })
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @ApiPropertyOptional({
    type: [ParesDeUnaTallaDto],
    description: 'Pares que salen, por talla. Sin esto sale la caja completa.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ParesDeUnaTallaDto)
  items?: ParesDeUnaTallaDto[];
}
