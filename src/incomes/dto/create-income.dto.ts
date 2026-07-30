import {
  IsString,
  IsNumber,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Registrar un ingreso manual (no proviene de una venta). Se cataloga como
// OTROS automáticamente. Lleva una nota, no productos.
export class CreateIncomeDto {
  @ApiProperty({ example: 150000 })
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiPropertyOptional({
    example: 'TRANSFERENCIA',
    description: 'Método/medio del ingreso (EFECTIVO, TARJETA, TRANSFERENCIA...)',
  })
  @IsOptional()
  @IsString()
  method?: string;

  @ApiPropertyOptional({ description: 'Banco donde entra el dinero' })
  @IsOptional()
  @IsUUID()
  bankId?: string;

  @ApiPropertyOptional({ example: 'Aporte de caja / préstamo' })
  @IsOptional()
  @IsString()
  note?: string;
}
