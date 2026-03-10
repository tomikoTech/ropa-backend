import { IsString, IsOptional, IsEnum, IsEmail } from 'class-validator';
import { DocumentType } from '../../common/enums/document-type.enum.js';

export class CreateClientDto {
  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

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
