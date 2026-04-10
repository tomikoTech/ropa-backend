import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsIn,
  IsUUID,
  Min,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CalculateCheckoutItemDto {
  @ApiProperty()
  @IsUUID()
  variantId: string;

  @ApiProperty({ example: 1 })
  @IsNumber()
  @Min(1)
  quantity: number;
}

export class CalculateCheckoutDto {
  @ApiProperty({ type: [CalculateCheckoutItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CalculateCheckoutItemDto)
  items: CalculateCheckoutItemDto[];

  @ApiPropertyOptional({ example: 'cod', enum: ['pickup', 'shipping', 'cod'] })
  @IsOptional()
  @IsIn(['pickup', 'shipping', 'cod'])
  deliveryMethod?: string;

  @ApiPropertyOptional({ example: 'Bogotá' })
  @IsOptional()
  @IsString()
  shippingCity?: string;

  @ApiPropertyOptional({ example: 'Cundinamarca' })
  @IsOptional()
  @IsString()
  shippingDepartment?: string;
}
