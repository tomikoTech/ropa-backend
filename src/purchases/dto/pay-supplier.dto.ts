import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Un pago al proveedor que se reparte entre varias facturas.
 *
 * Gemelo del abono de cartera. La diferencia con el pago de una sola factura
 * (`POST /accounts-payable/:id/payment`) es que acá **la plata llega primero y
 * después se decide a qué se aplica**: o a las facturas que se marquen, o al
 * saldo del proveedor empezando por la más vieja.
 */
export class PaySupplierDto {
  @ApiProperty({ example: 1_500_000 })
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiPropertyOptional({ example: 'TRANSFERENCIA', default: 'EFECTIVO' })
  @IsOptional()
  @IsString()
  method?: string;

  @ApiPropertyOptional({ example: 'Comprobante 4471' })
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiPropertyOptional({ description: 'De qué cuenta salió la plata' })
  @IsOptional()
  @IsUUID()
  bankId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  receiptImageUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

/** Las facturas que se están pagando, elegidas a mano. */
export class PayAccountsPayableDto extends PaySupplierDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsUUID('4', { each: true })
  accountIds: string[];
}
