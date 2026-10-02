import {
  IsString,
  IsOptional,
  IsEnum,
  IsEmail,
  ValidateIf,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { DocumentType } from '../../common/enums/document-type.enum.js';

export class CreateClientDto {
  // firstName/lastName son opcionales: permite el "cliente rápido" (solo
  // celular). El service rellena valores por defecto desde el teléfono.
  @IsString()
  @IsOptional()
  firstName?: string;

  @IsString()
  @IsOptional()
  lastName?: string;

  @IsEnum(DocumentType)
  @IsOptional()
  documentType?: DocumentType;

  @IsString()
  @IsOptional()
  documentNumber?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @ApiPropertyOptional({
    description: 'Descuento que se le propone al facturar (%)',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  @Max(100)
  descuentoPorDefecto?: number | null;
}
