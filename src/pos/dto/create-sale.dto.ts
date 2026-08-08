import {
  IsString,
  IsOptional,
  IsUUID,
  IsArray,
  ValidateNested,
  IsNumber,
  IsBoolean,
  IsEnum,
  Min,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentMethod } from '../../common/enums/payment-method.enum.js';
import { SaleChannel } from '../../common/enums/sale-channel.enum.js';

export class SaleItemDto {
  @IsUUID()
  variantId: string;

  /**
   * Bulto etiquetado que se está vendiendo (caja o par), si la venta viene de
   * escanear su código. Al cerrar la venta se marca como vendido para que no
   * pueda venderse dos veces.
   */
  @IsUUID()
  @IsOptional()
  stockUnitId?: string;

  @IsUUID()
  @IsOptional()
  promoterId?: string;

  @IsNumber()
  @Min(1)
  quantity: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  discountPercent?: number;

  // Precio unitario editado manualmente en el POS. Si viene, reemplaza el
  // precio de la variante/producto de la BD. Se refleja automáticamente en el
  // total de la venta (y por ende en ingresos, que derivan de payments.amount).
  @IsNumber()
  @Min(0)
  @IsOptional()
  unitPrice?: number;
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

  @IsUUID()
  @IsOptional()
  bankId?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  receivedAmount?: number;

  @IsString()
  @IsOptional()
  receiptImageUrl?: string;
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

  @IsEnum(SaleChannel)
  @IsOptional()
  saleChannel?: SaleChannel;

  // IVA opcional por venta: si se define, decide si esta venta aplica IVA
  // (tasa de la tienda) o no (0). Si se omite, usa el default del tenant.
  @IsBoolean()
  @IsOptional()
  applyTax?: boolean;

  // Confirmar el pago al crear la venta (métodos no-crédito). Si es false, la
  // venta queda PENDIENTE DE PAGO (sin registrar el pago) y se marca luego desde
  // Ventas. Si se omite, se asume true (comportamiento previo).
  @IsBoolean()
  @IsOptional()
  markAsPaid?: boolean;
}
