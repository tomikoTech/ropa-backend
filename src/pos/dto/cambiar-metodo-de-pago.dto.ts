import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { PaymentMethod } from '../../common/enums/payment-method.enum.js';

/**
 * Corregir con qué se pagó una venta que ya está hecha.
 *
 * No es un cobro nuevo: es decir que el anterior estaba mal anotado. Por eso
 * no lleva monto —siempre es el total de la venta— y sí lleva todo lo que el
 * método nuevo necesita para ser cierto: el banco, el número del comprobante,
 * su foto, y en crédito el cliente y la fecha de vencimiento.
 */
export class CambiarMetodoDePagoDto {
  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @IsUUID()
  @IsOptional()
  bankId?: string;

  @IsString()
  @IsOptional()
  reference?: string;

  @IsString()
  @IsOptional()
  receiptImageUrl?: string;

  // A crédito hace falta un cliente de verdad. Si la venta salió a nombre del
  // genérico de mostrador, acá se dice a quién se le fía.
  @IsUUID()
  @IsOptional()
  clientId?: string;

  @IsString()
  @IsOptional()
  creditDueDate?: string;

  @IsString()
  @IsOptional()
  creditNotes?: string;
}
