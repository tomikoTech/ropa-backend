import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';
export declare class Category extends TenantAwareEntity {
    id: string;
    name: string;
    slug: string;
    description: string;
    parent: Category | null;
    parentId: string | null;
    children: Category[];
    sortOrder: number;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}
