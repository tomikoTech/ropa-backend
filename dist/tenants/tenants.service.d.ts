import { Repository, DataSource } from 'typeorm';
import { Tenant } from './entities/tenant.entity.js';
import { OnboardStoreDto } from './dto/onboard-store.dto.js';
export declare class TenantsService {
    private readonly tenantRepo;
    private readonly dataSource;
    constructor(tenantRepo: Repository<Tenant>, dataSource: DataSource);
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
    onboardStore(dto: OnboardStoreDto): Promise<{
        tenant: {
            id: string;
            name: string;
            slug: string;
        };
        admin: {
            email: string;
        };
        storeSlug: string;
        warehouse: {
            id: string;
            name: string;
        };
    }>;
}
