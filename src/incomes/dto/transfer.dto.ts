import {
  IsString,
  IsNumber,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Transferencia: mover plata de un banco/método (origen) a otro (destino).
export class TransferDto {
  @ApiProperty({ example: 200000 })
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiPropertyOptional({ description: 'Método origen' })
  @IsOptional()
  @IsString()
  method?: string;

  @ApiPropertyOptional({ description: 'Banco origen' })
  @IsOptional()
  @IsUUID()
  bankId?: string;

  @ApiPropertyOptional({ description: 'Método destino' })
  @IsOptional()
  @IsString()
  targetMethod?: string;

  @ApiPropertyOptional({ description: 'Banco destino' })
  @IsOptional()
  @IsUUID()
  targetBankId?: string;

  @ApiPropertyOptional({ example: 'Paso de efectivo a Bancolombia' })
  @IsOptional()
  @IsString()
  note?: string;
}
