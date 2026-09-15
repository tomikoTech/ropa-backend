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
   * El bulto escaneado —esa caja, ese par— que se traslada.
   *
   * Sin esto el traslado era «N unidades de la talla» y el ledger elegía qué
   * bultos se iban por antigüedad: se escaneaba una caja para mandarla al
   * otro local y se iba otra caja distinta (o la existencia sin la caja). Con
   * el bulto puesto, se va ese, con su código, y la cantidad es la suya.
   */
  @ApiPropertyOptional({ example: 'uuid-del-bulto' })
  @IsOptional()
  @IsUUID()
  stockUnitId?: string;

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
