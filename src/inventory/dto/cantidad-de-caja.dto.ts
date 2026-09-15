import { IsInt, Max, Min } from 'class-validator';

/** El total de pares de una caja cerrada, corregido a mano. */
export class CantidadDeCajaDto {
  @IsInt()
  @Min(1)
  @Max(999)
  quantity!: number;
}
