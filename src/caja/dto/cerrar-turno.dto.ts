import {
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export class CerrarTurnoDto {
  @IsUUID()
  warehouseId: string;

  /** De quién es el turno. Un administrador puede cerrar el de otro. */
  @IsUUID()
  userId: string;

  /** Día de la tienda. Si no viene, hoy. */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La fecha debe ser YYYY-MM-DD' })
  dia?: string;

  /** Lo que se contó en el cajón, en pesos. */
  @IsNumber()
  @Min(0)
  efectivoContado: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notas?: string;
}

export class ReabrirTurnoDto {
  /**
   * Por qué se reabre.
   *
   * No es obligatorio: exigir un texto para desbloquear a alguien que tiene un
   * cliente enfrente convierte la válvula de escape en otra tranca.
   */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  motivo?: string;
}
