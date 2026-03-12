import { IsString, IsEmail, MinLength, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class OnboardStoreDto {
  @ApiProperty({ example: 'Mi Tienda Nueva' })
  @IsString()
  storeName: string;

  @ApiProperty({ example: 'admin@mitienda.co' })
  @IsEmail()
  adminEmail: string;

  @ApiProperty({ example: 'password123' })
  @IsString()
  @MinLength(6)
  adminPassword: string;

  @ApiPropertyOptional({ example: '573001234567' })
  @IsOptional()
  @IsString()
  whatsappNumber?: string;

  @ApiPropertyOptional({ example: '#2563eb' })
  @IsOptional()
  @IsString()
  accentColor?: string;
}
