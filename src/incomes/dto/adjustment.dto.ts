import { IsString, IsNumber, IsOptional, IsUUID } from 'class-validator';
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
}
