import {
  IsString,
  IsUUID,
  IsArray,
  ValidateNested,
  IsNumber,
  Min,
  ArrayMinSize,
  IsOptional,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { PaymentMethod } from '../../common/enums/payment-method.enum.js';

export class ReturnItemDto {
  @ApiProperty({ description: 'ID del item de la venta original' })
  @IsUUID()
  saleItemId: string;

  @ApiProperty({ example: 1 })
  @IsNumber()
  @Min(1)
  @IsOptional()
  quantity?: number;

  @ApiProperty({ required: false, description: 'Código físico devuelto' })
  @IsString()
  @IsOptional()
  returnedBarcode?: string;

  @ApiProperty({ required: false, description: 'Código físico de reemplazo' })
  @IsString()
  @IsOptional()
  replacementBarcode?: string;

  @ApiProperty({ required: false, description: 'Valor total del reemplazo' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  replacementPrice?: number;
}

export class CreateReturnDto {
  @ApiProperty({ description: 'ID de la venta original' })
  @IsUUID()
  saleId: string;

  @ApiProperty({ example: 'Producto defectuoso' })
  @IsString()
  reason: string;

  @ApiProperty({ type: [ReturnItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReturnItemDto)
  items: ReturnItemDto[];

  @ApiProperty({
    required: false,
    description: 'Bodega que recibe físicamente',
  })
  @IsUUID()
  @IsOptional()
  destinationWarehouseId?: string;

  @ApiProperty({ required: false, description: 'Responsable de recibir' })
  @IsUUID()
  @IsOptional()
  receivedById?: string;

  @ApiProperty({ enum: PaymentMethod, required: false })
  @IsEnum(PaymentMethod)
  @IsOptional()
  settlementMethod?: PaymentMethod;

  @ApiProperty({ required: false })
  @IsUUID()
  @IsOptional()
  settlementBankId?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  settlementReference?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  notes?: string;
}
