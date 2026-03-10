import {
  IsString,
  IsOptional,
  IsUUID,
  IsArray,
  ValidateNested,
  IsNumber,
  IsEnum,
  Min,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentMethod } from '../../common/enums/payment-method.enum.js';

export class SaleItemDto {
  @IsUUID()
  variantId: string;

  @IsNumber()
  @Min(1)
  quantity: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  discountPercent?: number;
}

export class PaymentDto {
  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @IsNumber()
  @Min(0)
  amount: number;

  @IsString()
  @IsOptional()
  reference?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  receivedAmount?: number;
}

export class CreateSaleDto {
  @IsUUID()
  @IsOptional()
  clientId?: string;

  @IsUUID()
  warehouseId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaleItemDto)
  @ArrayMinSize(1)
  items: SaleItemDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentDto)
  @ArrayMinSize(1)
  payments: PaymentDto[];

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  creditDueDate?: string;

  @IsString()
  @IsOptional()
  creditNotes?: string;
}
