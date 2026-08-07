import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateShelfDto {
  @ApiProperty({ example: 'Estantería A' })
  @IsString()
  @IsNotEmpty()
  name: string;
}

export class CreateStandDto {
  @ApiProperty({ example: 'Stand 1' })
  @IsString()
  @IsNotEmpty()
  name: string;
}

export class UpdateLocationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
