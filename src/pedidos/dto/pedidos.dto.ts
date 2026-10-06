import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '../../common/enums/payment-method.enum.js';

/** «Me está pidiendo que le agregue 6 de Good Girl Blush»: un renglón extra. */
export class AgregadoDto {
  @IsUUID()
  variantId: string;

  @IsInt()
  @Min(1)
  cantidad: number;

  @ApiPropertyOptional({ description: 'Precio a mano; si falta, el de lista' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  precioUnitario?: number;

  @ApiPropertyOptional({ description: 'No lleva el descuento general' })
  @IsOptional()
  @IsBoolean()
  sinDescuento?: boolean;
}

export class AceptarPedidoDto {
  @ApiPropertyOptional({
    description:
      'Cantidad aceptada por renglón (id del renglón → cantidad); lo que falte va completo',
  })
  @IsOptional()
  @IsObject()
  cantidades?: Record<string, number>;

  @ApiPropertyOptional({
    description:
      'Precio unitario a mano por renglón (id del renglón → precio): «a Yum Yum le dieron precio de 50.000»',
  })
  @IsOptional()
  @IsObject()
  precios?: Record<string, number>;

  @ApiPropertyOptional({
    description: 'Renglones (ids) que no llevan el descuento general',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sinDescuento?: string[];

  @ApiPropertyOptional({ type: [AgregadoDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AgregadoDto)
  agregados?: AgregadoDto[];

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
