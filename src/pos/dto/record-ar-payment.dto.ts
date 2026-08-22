import {
  ArrayNotEmpty,
  IsArray,
  IsNumber,
  IsEnum,
  IsString,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator';
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
