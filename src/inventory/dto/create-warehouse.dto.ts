import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateWarehouseDto {
  @ApiProperty({ example: 'Bodega Principal' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'BOD-01' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiPropertyOptional({ example: 'Calle 123 #45-67, Bogotá' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isPosLocation?: boolean;
}
