import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsOptional, IsUUID } from 'class-validator';

export class FacturaDeTercerosDto {
  @ApiProperty({
    description: 'Las filas del ticket. Un ticket con tres productos de tercero son tres filas.',
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1)
  // Un ticket no tiene cincuenta renglones; más que eso es un error o alguien
  // pidiendo un PDF gigante.
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  ids: string[];
}

export class FacturaDeVentaDto {
  @ApiProperty({
    required: false,
    description:
      'Filas de ventas de terceros que salieron en el mismo ticket, para que vayan en la misma factura.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  terceros?: string[];
}
