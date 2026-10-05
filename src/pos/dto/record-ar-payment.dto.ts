import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsNumber,
  IsEnum,
  IsString,
  IsOptional,
  IsUUID,
  MaxLength,
  Min,
  ArrayMinSize,
  ValidateNested,
  IsIn,
} from 'class-validator';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { PaymentMethod } from '../../common/enums/payment-method.enum.js';

export class RecordArPaymentDto {
  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @IsString()
  @IsOptional()
  reference?: string;

  @IsUUID()
  @IsOptional()
  bankId?: string;

  @IsString()
  @IsOptional()
  receiptImageUrl?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

/**
 * Cobrar varias deudas de una vez.
 *
 * Un local que debe diez pares de días distintos se cobra marcando los que
 * está pagando, no entrando día por día. El abono se reparte entre las cuentas
 * elegidas, de la más vieja a la más nueva.
 */
export class CollectAccountsDto extends RecordArPaymentDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  accountIds: string[];
}

/**
 * Por qué se deshace un abono.
 *
 * Opcional a propósito: exigir una explicación para arreglar un error de
 * digitación es la clase de fricción que hace que la gente prefiera dejar el
 * dato mal. Cuando se escribe, queda en las notas del contra-abono.
 */
export class ReverseArPaymentDto {
  @ApiPropertyOptional({ example: 'El cliente devolvió la mercancía' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  motivo?: string;
}

export class RepartoDelReciboDto {
  @ApiProperty({ description: 'La cuenta por cobrar (factura) a la que va' })
  @IsUUID()
  accountReceivableId: string;

  @ApiProperty({ example: 50000 })
  @IsNumber()
  @Min(0)
  amount: number;
}

/** Un recibo que paga varias facturas: `reference` es el número del recibo. */
export class RecibirReciboDto extends RecordArPaymentDto {
  @ApiProperty({ type: [RepartoDelReciboDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RepartoDelReciboDto)
  reparto: RepartoDelReciboDto[];
}

/**
 * Corregir cómo entró un abono: método, banco, número de recibo, nota.
 *
 * El monto no viaja a propósito: cambiarlo reescribe el cuadre del día en que
 * entró la plata. Para eso está deshacer y volver a registrar.
 */
export class CorregirAbonoDto {
  @ApiPropertyOptional({ enum: ['EFECTIVO', 'TARJETA', 'TRANSFERENCIA'] })
  @IsOptional()
  @IsIn(['EFECTIVO', 'TARJETA', 'TRANSFERENCIA'])
  method?: 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA';

  @ApiPropertyOptional({ description: 'null quita el banco' })
  @IsOptional()
  @IsUUID()
  bankId?: string | null;

  @ApiPropertyOptional({ description: 'Número del recibo. null lo borra' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string | null;
}
