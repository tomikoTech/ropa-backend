import {
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ClicDto {
  @IsString()
  @MaxLength(40)
  columna: string;

  @IsString()
  @MaxLength(300)
  valor: string;
}

/**
 * Una consulta directa a una herramienta, sin pasar por el modelo: el clic en
 * una celda o quitar un filtro de una tabla que ya está en pantalla.
 */
export class ConsultaDto {
  @IsString()
  @MaxLength(40)
  herramienta: string;

  /** Los mismos argumentos por nombre que usa el modelo. */
  @IsObject()
  argumentos: Record<string, string | boolean | number | null>;

  @IsOptional()
  @ValidateNested()
  @Type(() => ClicDto)
  clic?: ClicDto;
}
