import {
  IsString,
  IsUUID,
  IsArray,
  ValidateNested,
  IsNumber,
  Min,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class ReturnItemDto {
  @ApiProperty({ description: 'ID del item de la venta original' })
  @IsUUID()
  saleItemId: string;

  @ApiProperty({ example: 1 })
  @IsNumber()
  @Min(1)
  quantity: number;
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
}
