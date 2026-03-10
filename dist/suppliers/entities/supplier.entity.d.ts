import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';
export declare class Supplier extends TenantAwareEntity {
    id: string;
    name: string;
    nit: string;
    contactName: string;
    email: string;
    phone: string;
    address: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}
