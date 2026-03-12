import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EcommerceOrderStatus } from '../../common/enums/ecommerce-order-status.enum.js';

export class UpdateOrderStatusDto {
  @ApiProperty({ enum: EcommerceOrderStatus })
  @IsEnum(EcommerceOrderStatus)
  status: EcommerceOrderStatus;

  @ApiPropertyOptional({ example: 'Pedido confirmado, preparando envío' })
  @IsOptional()
  @IsString()
  adminNotes?: string;
}
