import { DocumentType } from '../../common/enums/document-type.enum.js';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';
export declare class Client extends TenantAwareEntity {
    id: string;
    firstName: string;
    lastName: string;
    documentType: DocumentType;
    documentNumber: string;
    email: string;
    phone: string;
    address: string;
    isGeneric: boolean;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}
