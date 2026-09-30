import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';

/**
 * Cambiar el propio nombre de usuario (y cómo aparece uno en la pantalla).
 *
 * Lo valida de verdad `credenciales.ts`; acá solo se frena lo absurdo antes
 * de llegar al servicio.
 */
export class CambiarMiUsuarioDto {
  @ApiPropertyOptional({ example: 'andres' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  username?: string;

  @ApiPropertyOptional({ example: 'Andrés' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Martínez' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  lastName?: string;
}

export class CambiarMiClaveDto {
  @ApiProperty({ description: 'La que se usa hoy' })
  @IsString()
  @MinLength(1)
  actual: string;

  @ApiProperty({ description: 'La nueva' })
  @IsString()
  @MinLength(6)
  nueva: string;
}
