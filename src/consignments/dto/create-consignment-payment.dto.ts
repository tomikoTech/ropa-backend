import { ApiProperty } from '@nestjs/swagger';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateConsignmentPaymentDto {
  @ApiProperty({
    enum: ['CLIENT', 'SUPPLIER'],
    description: 'CLIENT: te paga el cliente. SUPPLIER: le pagas al tercero.',
  })
  @IsIn(['CLIENT', 'SUPPLIER'])
  lado: 'CLIENT' | 'SUPPLIER';

  @ApiProperty({ description: 'Monto del abono (pesos).' })
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiProperty({ required: false, description: 'EFECTIVO | TRANSFERENCIA | …' })
  @IsOptional()
  @IsString()
  method?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiProperty({ required: false, description: 'Fecha del abono (ISO).' })
  @IsOptional()
  @IsString()
  paidAt?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}
