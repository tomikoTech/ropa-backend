import {
  IsArray,
  ValidateNested,
  ArrayMinSize,
  IsOptional,
  IsString,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentDto } from '../../pos/dto/create-sale.dto.js';

// Convierte una cotización en venta real (descuenta stock y genera factura).
// Se reutilizan los ítems de la cotización; aquí solo se aportan los pagos.
export class ConvertQuotationDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentDto)
  @ArrayMinSize(1)
  payments: PaymentDto[];

  @IsBoolean()
  @IsOptional()
  markAsPaid?: boolean;

  @IsString()
  @IsOptional()
  creditDueDate?: string;

  @IsString()
  @IsOptional()
  creditNotes?: string;
}
