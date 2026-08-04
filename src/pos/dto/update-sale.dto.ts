import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { SaleChannel } from '../../common/enums/sale-channel.enum.js';

// Edición de una venta existente. Solo propiedades que NO afectan inventario
// (los ítems/cantidades no se editan aquí). Al cambiar el descuento se recalcula
// el total y se sincroniza la cuenta por cobrar si la venta es a crédito.
export class UpdateSaleDto {
  @IsUUID()
  @IsOptional()
  clientId?: string | null;

  @IsString()
  @IsOptional()
  invoiceNumber?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsEnum(SaleChannel)
  @IsOptional()
  saleChannel?: SaleChannel;

  // Fecha de la venta (ISO). Ajusta created_at.
  @IsString()
  @IsOptional()
  saleDate?: string;

  // Descuento total en pesos. Recalcula total = subtotal - descuento + IVA.
  @IsNumber()
  @Min(0)
  @IsOptional()
  discountAmount?: number;
}
