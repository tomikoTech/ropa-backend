import { TenantsService } from './tenants.service.js';
import { OnboardStoreDto } from './dto/onboard-store.dto.js';
export declare class TenantsController {
    private readonly tenantsService;
    constructor(tenantsService: TenantsService);
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
    create(body: {
        name: string;
        slug: string;
    }): Promise<import("./entities/tenant.entity.js").Tenant>;
    findAll(): Promise<import("./entities/tenant.entity.js").Tenant[]>;
    findOne(id: string): Promise<import("./entities/tenant.entity.js").Tenant>;
    update(id: string, body: Partial<{
        name: string;
        slug: string;
        isActive: boolean;
    }>): Promise<import("./entities/tenant.entity.js").Tenant>;
    remove(id: string): Promise<void>;
}
