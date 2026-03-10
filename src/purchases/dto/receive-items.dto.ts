import {
  IsArray,
  ValidateNested,
  IsUUID,
  IsNumber,
  Min,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class ReceiveItemDto {
  @ApiProperty({ description: 'ID del item de la orden' })
  @IsUUID()
  itemId: string;

  @ApiProperty({ example: 5, description: 'Cantidad recibida' })
  @IsNumber()
  @Min(1)
  quantityReceived: number;
}

export class ReceiveItemsDto {
  @ApiProperty({ type: [ReceiveItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReceiveItemDto)
  items: ReceiveItemDto[];
}
