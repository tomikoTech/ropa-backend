import { IsInt, IsOptional, Min, ValidateIf } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Lo que se puede cambiar desde la página «Costo de perfumes», fila por fila.
 * `null` borra el valor propio y vuelve al general / al de la compra.
 */
export class AjusteDeCostoDto {
  @ApiPropertyOptional({
    example: 5000,
    description: 'Mano de obra de este perfume; null = la general de la tienda',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  manoDeObra?: number | null;

  @ApiPropertyOptional({
    example: 30000,
    description:
      'Costo del frasco escrito a mano; solo vale mientras no haya una compra recibida del frasco',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  costoFrasco?: number | null;
}
