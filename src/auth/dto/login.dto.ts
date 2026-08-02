import { IsString, IsNotEmpty, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  // Acepta email O nombre de usuario. Se mantiene el nombre de campo `email`
  // por compatibilidad con los clientes existentes.
  @ApiProperty({ example: 'admin@mipinta.co o cesar', description: 'Email o usuario' })
  @IsString()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'admin123' })
  @IsString()
  @MinLength(6)
  password: string;
}
