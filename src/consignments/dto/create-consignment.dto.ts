import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateConsignmentDto {
  @ApiProperty({ example: 'Proveedor', description: 'Dueño del producto (tercero)' })
  @IsString()
  @IsNotEmpty()
  thirdPartyName: string;

  @ApiProperty({ example: 'Descripción del producto' })
  @IsString()
  @IsNotEmpty()
  productDescription: string;

  @ApiPropertyOptional({ example: '40' })
  @IsOptional()
  @IsString()
  size?: string;

  @ApiPropertyOptional({ example: 'Blanco' })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @ApiProperty({ example: 120000, description: 'Costo unitario (le debes al tercero)' })
  @IsNumber()
  @Min(0)
  costPrice: number;

  @ApiProperty({ example: 150000, description: 'Precio de venta unitario' })
  @IsNumber()
  @Min(0)
  salePrice: number;

  @ApiPropertyOptional({ example: 'Nombre del cliente' })
  @IsOptional()
  @IsString()
  clientName?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  clientPaid?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  supplierPaid?: boolean;

  @ApiPropertyOptional({ example: 'Efectivo' })
  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @ApiPropertyOptional({ description: 'Fecha de la venta (ISO). Default: ahora.' })
  @IsOptional()
  @IsDateString()
  saleDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
