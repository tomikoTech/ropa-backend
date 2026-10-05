import {
  IsString,
  IsNumber,
  IsOptional,
  IsUUID,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Ajuste de saldo: sumar (amount > 0) o restar (amount < 0) plata de un
// banco/método sin que sea un ingreso por venta.
export class AdjustmentDto {
  @ApiProperty({
    example: -50000,
    description: 'Positivo para añadir, negativo para quitar',
  })
  @IsNumber()
  amount: number;

  @ApiPropertyOptional({ description: 'Método/medio afectado' })
  @IsOptional()
  @IsString()
  method?: string;

  @ApiPropertyOptional({ description: 'Banco afectado' })
  @IsOptional()
  @IsUUID()
  bankId?: string;

  @ApiPropertyOptional({ example: 'Corrección de arqueo' })
  @IsOptional()
  @IsString()
  note?: string;

  // Para cargar el saldo inicial «al 1 de octubre», el día desde el que
  // cuenta la tesorería. Si no viene, hoy.
  @ApiPropertyOptional({
    example: '2026-10-01',
    description: 'Día del ajuste (YYYY-MM-DD); por defecto hoy',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'fecha debe ser YYYY-MM-DD' })
  fecha?: string;
}
