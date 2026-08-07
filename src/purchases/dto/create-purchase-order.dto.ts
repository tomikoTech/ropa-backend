import {
  IsString,
  IsUUID,
  IsArray,
  ValidateNested,
  IsNumber,
  IsBoolean,
  IsOptional,
  Min,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PurchaseOrderItemDto {
  @ApiProperty()
  @IsUUID()
  variantId: string;

  @ApiProperty({ example: 10 })
  @IsNumber()
  @Min(1)
  quantityOrdered: number;

  @ApiProperty({ example: 25000 })
  @IsNumber()
  @Min(0)
  unitCost: number;
}

export class CreatePurchaseOrderDto {
  @ApiProperty()
  @IsUUID()
  supplierId: string;

  @ApiProperty()
  @IsUUID()
  warehouseId: string;

  /**
   * Renglones clásicos, uno por variante. Puede venir vacío: una compra de
   * importación se crea primero y después se le cargan los renglones por caja,
   * que viven en otra tabla porque una caja trae varias tallas a la vez.
   */
  @ApiProperty({ type: [PurchaseOrderItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderItemDto)
  items: PurchaseOrderItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Número de factura del proveedor' })
  @IsOptional()
  @IsString()
  supplierInvoiceNumber?: string;

  @ApiPropertyOptional({ description: 'Fecha vencimiento cuenta por pagar' })
  @IsOptional()
  @IsDateString()
  paymentDueDate?: string;

  @ApiPropertyOptional({
    description:
      'Aplicar IVA (tasa de la tienda) sobre el total. Si se omite, usa el default del tenant.',
  })
  @IsOptional()
  @IsBoolean()
  applyTax?: boolean;
}
