import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TransferStockDto {
  @ApiProperty({ example: 'uuid-variante' })
  @IsUUID()
  variantId: string;

  @ApiProperty({ example: 'uuid-bodega-origen' })
  @IsUUID()
  fromWarehouseId: string;

  @ApiProperty({ example: 'uuid-bodega-destino' })
  @IsUUID()
  toWarehouseId: string;

  @ApiProperty({ example: 5 })
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiPropertyOptional({ example: 'Traslado para reposición de tienda' })
  @IsOptional()
  @IsString()
  notes?: string;

  /**
   * ¿Este traslado necesita que el destino confirme la recepción?
   *
   * Si no se manda, decide el ajuste de la tienda (`transferConfirmationEnabled`),
   * que es el comportamiento de siempre. Mandarlo permite decidirlo **por
   * operación**: mandar mercancía a otra ciudad puede exigir confirmación aunque
   * mover algo entre dos bodegas del mismo local no la exija.
   *
   * Además quita una dependencia incómoda: antes el resultado de la misma
   * petición cambiaba según un ajuste global, así que quien la llamaba no podía
   * saber si iba a mover el stock o a dejarlo en tránsito.
   */
  @ApiPropertyOptional({
    example: false,
    description:
      'Si el destino debe confirmar la recepción. Por defecto, el ajuste de la tienda.',
  })
  @IsOptional()
  @IsBoolean()
  requireConfirmation?: boolean;
}
