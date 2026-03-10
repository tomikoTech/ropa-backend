import { IsNumber, IsEnum, IsString, IsOptional, Min } from 'class-validator';
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

  @IsString()
  @IsOptional()
  receiptImageUrl?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
