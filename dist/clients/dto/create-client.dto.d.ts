import { DocumentType } from '../../common/enums/document-type.enum.js';
export declare class CreateClientDto {
    firstName: string;
    lastName: string;
    documentType?: DocumentType;
    documentNumber?: string;
    email?: string;
    phone?: string;
    address?: string;
}
