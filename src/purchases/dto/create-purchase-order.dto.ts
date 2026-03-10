import {
  IsString,
  IsUUID,
  IsArray,
  ValidateNested,
  IsNumber,
  IsOptional,
  Min,
  ArrayMinSize,
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

  @ApiProperty({ type: [PurchaseOrderItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderItemDto)
  items: PurchaseOrderItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Fecha vencimiento cuenta por pagar' })
  @IsOptional()
  @IsDateString()
  paymentDueDate?: string;
}
