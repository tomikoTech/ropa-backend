import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Dar de baja un bulto por su código: el motivo es opcional pero recomendado. */
export class DarDeBajaDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  motivo?: string;
}
