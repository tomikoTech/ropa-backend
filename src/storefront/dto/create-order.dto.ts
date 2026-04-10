import {
  IsString,
  IsOptional,
  IsArray,
  IsNumber,
  IsUUID,
  IsIn,
  Min,
  ValidateNested,
  IsEmail,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateOrderItemDto {
  @ApiProperty()
  @IsUUID()
  variantId: string;

  @ApiProperty({ example: 1 })
  @IsNumber()
  @Min(1)
  quantity: number;
}

export class CreateOrderDto {
  @ApiProperty({ example: 'Juan Pérez' })
  @IsString()
  customerName: string;

  @ApiPropertyOptional({ example: '3001234567' })
  @IsOptional()
  @IsString()
  customerPhone?: string;

  @ApiPropertyOptional({ example: 'juan@email.com' })
  @IsOptional()
  @IsEmail()
  customerEmail?: string;

  @ApiPropertyOptional({ example: 'Por favor enviar bien empacado' })
  @IsOptional()
  @IsString()
  customerNotes?: string;

  @ApiPropertyOptional({ example: 'https://mipinta.com' })
  @IsOptional()
  @IsString()
  ecommerceBaseUrl?: string;

  @ApiPropertyOptional({ example: 'whatsapp' })
  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @ApiPropertyOptional({ example: 'Bogotá' })
  @IsOptional()
  @IsString()
  shippingCity?: string;

  @ApiPropertyOptional({ example: 'Calle 100 #15-20' })
  @IsOptional()
  @IsString()
  shippingAddress?: string;

  @ApiPropertyOptional({ example: 'Apto 301, Torre B' })
  @IsOptional()
  @IsString()
  shippingAddressDetails?: string;

  @ApiPropertyOptional({ example: 'local' })
  @IsOptional()
  @IsString()
  shippingType?: string;

  @ApiPropertyOptional({ example: 'pickup', enum: ['pickup', 'shipping', 'cod'] })
  @IsOptional()
  @IsIn(['pickup', 'shipping', 'cod'])
  deliveryMethod?: string;

  @ApiPropertyOptional({ example: 'Cundinamarca' })
  @IsOptional()
  @IsString()
  shippingDepartment?: string;

  @ApiProperty({ type: [CreateOrderItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];
}
