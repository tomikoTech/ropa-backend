import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
  MaxLength,
} from 'class-validator';
import { PurchaseOrderItemDto } from './create-purchase-order.dto.js';

export class UpdatePurchaseOrderDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @ApiPropertyOptional({ type: [PurchaseOrderItemDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderItemDto)
  items?: PurchaseOrderItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    description:
      'Cómo llama la tienda a este pedido («PROMO WIMFLO»). Es lo que se rotula en la etiqueta de la caja.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  orderName?: string;

  @ApiPropertyOptional({ description: 'Número de factura del proveedor' })
  @IsOptional()
  @IsString()
  supplierInvoiceNumber?: string;

  @ApiPropertyOptional({ description: 'Fecha vencimiento cuenta por pagar' })
  @IsOptional()
  @IsDateString()
  paymentDueDate?: string;

  @ApiPropertyOptional({
    description: 'Aplicar IVA (tasa de la tienda) sobre el total.',
  })
  @IsOptional()
  @IsBoolean()
  applyTax?: boolean;
}
