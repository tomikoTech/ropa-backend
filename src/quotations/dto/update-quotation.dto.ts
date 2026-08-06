import { PartialType } from '@nestjs/mapped-types';
import { IsOptional, IsString } from 'class-validator';
import { CreateQuotationDto } from './create-quotation.dto.js';

export class UpdateQuotationDto extends PartialType(CreateQuotationDto) {
  // Estados manuales de la cotización (DRAFT/SENT/APPROVED/EXPIRED).
  @IsOptional()
  @IsString()
  status?: string;
}
