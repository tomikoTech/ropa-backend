import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';
export declare class Warehouse extends TenantAwareEntity {
    id: string;
    name: string;
    code: string;
    address: string;
    isPosLocation: boolean;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}
