import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { PaymentMethod } from '../../common/enums/payment-method.enum.js';

// Marca una venta pendiente como pagada. El número de recibo y la foto del
// comprobante son opcionales; el banco aplica a TARJETA/TRANSFERENCIA.
export class MarkSalePaidDto {
  // Opcional: si no viene, se usa el método que se eligió al vender
  // (`intendedPaymentMethod`). Volver a preguntarlo era la queja: la tienda ya
  // había dicho «transferencia» al cobrar.
  @IsEnum(PaymentMethod)
  @IsOptional()
  method?: PaymentMethod;

  @IsUUID()
  @IsOptional()
  bankId?: string;

  @IsString()
  @IsOptional()
  reference?: string;

  @IsString()
  @IsOptional()
  receiptImageUrl?: string;
}
