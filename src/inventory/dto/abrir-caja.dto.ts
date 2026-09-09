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
}

/**
 * Abrir una caja.
 *
 * Sin cuerpo se abre entera, que es lo de siempre. Con `items` salen solo esos
 * pares y la caja se queda con el resto.
 */
export class AbrirCajaDto {
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
