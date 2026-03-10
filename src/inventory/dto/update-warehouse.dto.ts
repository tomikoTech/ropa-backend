import { IsBoolean, IsOptional, IsString } from 'class-validator';
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
}
