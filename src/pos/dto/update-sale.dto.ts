import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SaleChannel } from '../../common/enums/sale-channel.enum.js';

// Ítem al editar una venta (lista completa que reemplaza a la anterior).
export class UpdateSaleItemDto {
  @IsUUID()
  variantId: string;

  @IsNumber()
  @Min(1)
  quantity: number;
}

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

  // Lista COMPLETA de ítems (reemplaza la anterior). Revierte el inventario de
  // los ítems previos y aplica el de los nuevos. Recalcula subtotal/IVA/total.
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => UpdateSaleItemDto)
  items?: UpdateSaleItemDto[];
}
