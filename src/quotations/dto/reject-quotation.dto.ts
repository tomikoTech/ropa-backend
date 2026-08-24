import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class RejectQuotationDto {
  @ApiProperty({
    description:
      'Por qué se rechaza. Lo lee el vendedor, que no estuvo en la conversación.',
    example: 'No hay talla 41 disponible',
  })
  @IsString()
  @MinLength(1, { message: 'Escribe el motivo del rechazo.' })
  reason: string;
}
