import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateWarehouseDto {
  @ApiPropertyOptional({ example: 'Bodega Actualizada' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'BOD-02' })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({ example: 'Nueva dirección' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPosLocation?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description:
      'La bodega principal de la tienda. Solo una: marcar otra libera a la anterior.',
  })
  @IsOptional()
  @IsBoolean()
  isMain?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isExhibition?: boolean;

  @ApiPropertyOptional({
    description: 'De qué local es la vitrina. Nulo la desvincula.',
  })
  @IsOptional()
  @IsUUID()
  exhibitionOfWarehouseId?: string | null;
}
