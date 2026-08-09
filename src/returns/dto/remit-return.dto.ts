import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RemitReturnDto {
  @ApiProperty({
    description: 'Bodega que recibe definitivamente la mercancía',
  })
  @IsUUID()
  destinationWarehouseId: string;
}
