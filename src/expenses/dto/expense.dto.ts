import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsNotEmpty,
  IsUUID,
  IsIn,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '../../common/enums/payment-method.enum.js';

export class CreateExpenseCategoryDto {
  @ApiProperty({ example: 'Servicios públicos' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}

export class CreateExpenseDto {
  @ApiProperty({ example: 'Recibo de energía agosto' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ example: 250000 })
  @IsNumber()
  @Min(1)
  amount: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @ApiPropertyOptional({
    enum: [
      PaymentMethod.EFECTIVO,
      PaymentMethod.TARJETA,
      PaymentMethod.TRANSFERENCIA,
    ],
    default: PaymentMethod.EFECTIVO,
  })
  @IsOptional()
  @IsIn([
    PaymentMethod.EFECTIVO,
    PaymentMethod.TARJETA,
    PaymentMethod.TRANSFERENCIA,
  ])
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  bankId?: string;

  @ApiPropertyOptional({ description: 'Caja menor de la que sale el dinero' })
  @IsOptional()
  @IsUUID()
  pettyCashId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expenseDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreatePettyCashDto {
  @ApiProperty({ example: 'Caja menor tienda centro' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @ApiPropertyOptional({ example: 500000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  fundedAmount?: number;
}

export class FundPettyCashDto {
  @ApiProperty({ example: 200000, description: 'Monto a reponer' })
  @IsNumber()
  @Min(1)
  amount: number;
}
