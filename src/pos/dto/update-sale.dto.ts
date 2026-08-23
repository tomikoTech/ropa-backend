import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
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

  /**
   * Qué pares concretos se lleva esta línea, por su bulto.
   *
   * Sin esto, al editar una factura el inventario elige por antigüedad: el
   * cliente devuelve **uno** de los dos pares que compró, se baja la cantidad
   * de dos a uno, y el par que queda registrado como vendido no es el que el
   * cliente se llevó. El código impreso en la caja que sigue en su casa figura
   * como devuelto.
   *
   * Opcional: quien no elige sigue con la cascada de siempre. Si se eligen
   * menos de los que dice `quantity`, el resto sale de la cascada.
   */
  @IsArray()
  @IsOptional()
  @IsUUID('4', { each: true })
  stockUnitIds?: string[];

  // Precio histórico corregido para esta línea. No cambia el precio del
  // catálogo: actualiza únicamente el snapshot de la venta.
  @IsNumber()
  @Min(0)
  unitPrice: number;

  // Descuento histórico propio de esta línea. Es indispensable al editar una
  // venta que mezcla descuentos por producto: omitirlo y reconstruir todo a
  // partir del descuento global cambia silenciosamente los totales.
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  discountPercent?: number;
}

// Edición de una venta existente. Los importes se recalculan dentro de una sola
// transacción y se sincronizan con pagos/cartera para que ningún total quede
// contradiciendo sus relaciones.
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

  // Total final corregido. En ventas con líneas se convierte en descuento
  // proporcional para conservar la igualdad líneas = venta; en facturas
  // históricas sin líneas actualiza directamente el snapshot monetario.
  @IsNumber()
  @Min(0)
  @IsOptional()
  total?: number;

  // Lista COMPLETA de ítems (reemplaza la anterior). Revierte el inventario de
  // los ítems previos y aplica el de los nuevos. Recalcula subtotal/IVA/total.
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => UpdateSaleItemDto)
  items?: UpdateSaleItemDto[];
}
