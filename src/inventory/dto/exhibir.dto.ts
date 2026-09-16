import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Subir un par del local a la vitrina. */
export class ExhibirDto {
  @ApiProperty({ description: 'La vitrina donde va el par' })
  @IsUUID()
  vitrinaId: string;

  @ApiProperty({ description: 'Qué talla y color se sube' })
  @IsUUID()
  variantId: string;

  @ApiProperty({ example: 1, description: 'Cuántos pares suben' })
  @IsInt()
  @IsPositive()
  cantidad: number;
}

/**
 * Subir a la vitrina **ese** par o esa caja, por su código.
 *
 * El panel de «falta por exhibir» elige el par por antigüedad; con el sticker
 * en la mano lo que se quiere es subir el que se tiene, y saber cuál fue.
 */
export class ExhibirPorCodigoDto {
  @ApiProperty({ example: '26091500010130015' })
  @IsString()
  @IsNotEmpty()
  codigo: string;

  @ApiPropertyOptional({
    description:
      'A qué vitrina. Solo hace falta si el local del bulto surte más de una.',
  })
  @IsOptional()
  @IsUUID()
  vitrinaId?: string;
}
