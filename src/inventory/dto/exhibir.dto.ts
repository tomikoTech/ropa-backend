import { IsInt, IsPositive, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

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
