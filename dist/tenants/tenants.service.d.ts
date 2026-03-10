import { Repository } from 'typeorm';
import { Tenant } from './entities/tenant.entity.js';
export declare class TenantsService {
    private readonly tenantRepo;
    constructor(tenantRepo: Repository<Tenant>);
    create(data: {
        name: string;
        slug: string;
    }): Promise<Tenant>;
    findAll(): Promise<Tenant[]>;
    findOne(id: string): Promise<Tenant>;
    update(id: string, data: Partial<{
        name: string;
        slug: string;
        isActive: boolean;
    }>): Promise<Tenant>;
    remove(id: string): Promise<void>;
}
