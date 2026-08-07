import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSizeDto {
  @ApiProperty({ example: '38' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({
    example: 'JUNIOR',
    description: 'Agrupación comercial',
  })
  @IsOptional()
  @IsString()
  sizeGroup?: string;

  @ApiPropertyOptional({
    example: 38,
    description: 'Orden de visualización. Si se omite se deduce del nombre.',
  })
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
