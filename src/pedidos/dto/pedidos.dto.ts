import {
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '../../common/enums/payment-method.enum.js';

export class AceptarPedidoDto {
  @ApiPropertyOptional({
    description:
      'Cantidad aceptada por renglón (id del renglón → cantidad); lo que falte va completo',
  })
  @IsOptional()
  @IsObject()
  cantidades?: Record<string, number>;

  @ApiPropertyOptional({ example: 15 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  descuentoPorcentaje?: number;

  @ApiPropertyOptional({
    enum: PaymentMethod,
    description: 'Por defecto a crédito',
  })
  @IsOptional()
  @IsEnum(PaymentMethod)
  metodoDePago?: PaymentMethod;

  @ApiPropertyOptional({ example: '2026-11-01' })
  @IsOptional()
  @IsString()
  creditDueDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  notas?: string;
}

export class RechazarPedidoDto {
  @ApiPropertyOptional({ example: 'Sin existencias de Good Girl' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  motivo?: string;
}
