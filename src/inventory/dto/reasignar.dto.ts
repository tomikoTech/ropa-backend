import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/**
 * Reasignar un bulto: a otra variante ya existente (`nuevaVariantId`), o a
 * **otra talla y color de su misma referencia** (`size` / `color`, por
 * nombre), que se crea si no existe.
 *
 * Lo segundo es lo que pasa con el sticker en la mano: «este par es 42, no
 * 41». Pedir que primero exista la variante era mandar a Productos a crearla
 * y volver; y si la talla no estaba en el catálogo, otro viaje más.
 */
export class ReasignarDto {
  @IsOptional()
  @IsUUID()
  nuevaVariantId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  size?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  color?: string | null;
}
