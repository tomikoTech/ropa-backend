import { IsString, IsOptional, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateBotConfigDto {
  @ApiPropertyOptional({ example: 'Qué más, máquina! Bienvenido a The Culture...' })
  @IsOptional()
  @IsString()
  greetingMessage?: string;

  @ApiPropertyOptional({ example: 'Vendemos zapatillas, ropa streetwear...' })
  @IsOptional()
  @IsString()
  aboutResponse?: string;

  @ApiPropertyOptional({ example: 'Lunes a sábado de 9am a 6pm' })
  @IsOptional()
  @IsString()
  hoursResponse?: string;

  @ApiPropertyOptional({ example: 'Estamos en Calle 100 #15-20, Bogotá' })
  @IsOptional()
  @IsString()
  locationResponse?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  outOfStockMessage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  menuHeader?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  btnProductsLabel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  btnAboutLabel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  btnHoursLabel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  botEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  whatsappAccessToken?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  whatsappPhoneNumberId?: string;
}
