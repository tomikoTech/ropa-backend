import { Role } from '../../common/enums/role.enum.js';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';
export declare class User extends TenantAwareEntity {
    id: string;
    email: string;
    passwordHash: string;
    firstName: string;
    lastName: string;
    role: Role;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}
