import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '../../common/enums/role.enum.js';

export class CreateUserDto {
  /**
   * Opcional si viene `username`: «usuarios solo con nombre». El servidor le
   * pone un correo técnico (`<usuario>@sin-correo.<tienda>`) para que la
   * columna, que es única por tienda, siga teniendo algo.
   */
  @ApiPropertyOptional({ example: 'admin@tomiko.co' })
  @ValidateIf((o: CreateUserDto) => !o.username || !!o.email)
  @IsEmail()
  email?: string;

  /**
   * Con qué entra esta persona, además del correo.
   *
   * Opcional porque no toda tienda lo usa, pero es lo que pidió el mostrador:
   * «principalmente usernames». Varias de las personas que venden no tienen
   * correo propio y hoy se les inventaba uno.
   */
  @ApiPropertyOptional({ example: 'andres' })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiProperty({ example: 'password123' })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiProperty({ example: 'Juan' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'Pérez' })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiPropertyOptional({ enum: Role, default: Role.COLABORADOR })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}
