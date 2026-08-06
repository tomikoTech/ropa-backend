import { IsString, IsOptional, IsEnum, IsEmail } from 'class-validator';
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
}
