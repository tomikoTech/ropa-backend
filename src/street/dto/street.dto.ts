import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentMethod } from '../../common/enums/payment-method.enum.js';

export class CreateStreetSellerDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name: string;

  @IsString()
  @IsOptional()
  @MaxLength(30)
  documentNumber?: string;

  @IsString()
  @IsOptional()
  @MaxLength(30)
  phone?: string;

  @IsString()
  @IsOptional()
  @MaxLength(300)
  notes?: string;
}

export class UpdateStreetSellerDto {
  @IsString()
  @IsOptional()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(30)
  documentNumber?: string;

  @IsString()
  @IsOptional()
  @MaxLength(30)
  phone?: string;

  @IsString()
  @IsOptional()
  @MaxLength(300)
  notes?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class DispatchItemDto {
  @IsUUID()
  variantId: string;

  @IsInt()
  @Min(1)
  quantity: number;

  /** Precio con el que sale a la calle. Si no viene, el del producto. */
  @IsNumber()
  @Min(0)
  @IsOptional()
  unitPrice?: number;

  /** Bulto etiquetado, si se despachó escaneando la caja. */
  @IsUUID()
  @IsOptional()
  stockUnitId?: string;
}

export class CreateDispatchDto {
  @IsUUID()
  streetSellerId: string;

  @IsUUID()
  warehouseId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DispatchItemDto)
  items: DispatchItemDto[];

  @IsString()
  @IsOptional()
  @MaxLength(300)
  notes?: string;
}

export class SettleLineDto {
  @IsUUID()
  itemId: string;

  @IsInt()
  @Min(0)
  sold: number;

  @IsInt()
  @Min(0)
  returned: number;
}

export class SettlePaymentDto {
  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @IsNumber()
  @Min(0)
  amount: number;

  @IsUUID()
  @IsOptional()
  bankId?: string;

  @IsString()
  @IsOptional()
  reference?: string;
}

export class SettleDispatchDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SettleLineDto)
  items: SettleLineDto[];

  /** Cómo entregó la plata. Si no viene, se asume efectivo por lo vendido. */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SettlePaymentDto)
  @IsOptional()
  payments?: SettlePaymentDto[];

  /** Cliente al que se le factura la venta de calle (opcional). */
  @IsUUID()
  @IsOptional()
  clientId?: string;
}
