import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Cerrar una remisión en tránsito: cancelarla (el origen se arrepintió) o no
 * aceptarla (el destino la rechaza).
 *
 * El motivo es opcional porque obligar a escribirlo termina en «asdf», pero
 * pedirlo es la diferencia entre un historial que sirve y uno que obliga a
 * preguntar por WhatsApp qué pasó con una remisión de hace tres semanas.
 */
export class CloseTransferDto {
  @ApiPropertyOptional({ example: 'Llegaron 3 pares en vez de 5' })
  @IsOptional()
  @IsString()
  reason?: string;
}

/**
 * Devolver al origen mercancía de un traslado que el destino ya recibió.
 *
 * El caso real: se mandaron seis pares, se vendieron cuatro, vuelven dos. Por
 * eso la cantidad es parcial y opcional —sin ella se devuelve todo lo que
 * quede pendiente—.
 */
export class ReturnTransferDto {
  @ApiPropertyOptional({ example: 2, description: 'Por defecto, todo lo que quede' })
  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @ApiPropertyOptional({ example: 'No se vendió en la sede norte' })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({
    description:
      'Si el origen debe confirmar que la devolución le llegó. Por defecto, el ajuste de la tienda.',
  })
  @IsOptional()
  @IsBoolean()
  requireConfirmation?: boolean;
}
