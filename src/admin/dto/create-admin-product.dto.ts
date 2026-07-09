import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AdminVariantDto {
  @ApiPropertyOptional({ example: 'M' })
  @IsOptional()
  @IsString()
  size?: string;

  @ApiPropertyOptional({ example: 'Negro' })
  @IsOptional()
  @IsString()
  color?: string;
}

export class AdminImageBase64Dto {
  @ApiProperty({ description: 'Contenido base64 (sin prefijo data:)' })
  @IsString()
  @IsNotEmpty()
  data: string;

  @ApiPropertyOptional({ example: 'image/jpeg', default: 'image/jpeg' })
  @IsOptional()
  @IsString()
  mime?: string;
}

export class CreateAdminProductDto {
  @ApiProperty({ example: 'Camiseta Oversize Negra' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'Algodón pesado, corte oversize' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    example: 50000,
    description:
      'Precio en pesos (entero). Opcional: si no viene se guarda 0 = "precio a consultar"',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  basePrice?: number;

  @ApiPropertyOptional({
    example: 'UNISEX',
    description: 'UNISEX | HOMBRE | MUJER (alias DAMA). Default UNISEX.',
  })
  @IsOptional()
  @IsString()
  gender?: string;

  @ApiPropertyOptional({
    example: 'Camisetas',
    description: 'Categoría por nombre; se resuelve o se crea',
  })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ type: [AdminVariantDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AdminVariantDto)
  variants?: AdminVariantDto[];

  @ApiProperty({
    type: [AdminImageBase64Dto],
    description: 'Al menos una imagen (obligatorio)',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AdminImageBase64Dto)
  images_base64: AdminImageBase64Dto[];

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}
