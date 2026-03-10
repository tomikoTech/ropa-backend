import { TenantsService } from './tenants.service.js';
export declare class TenantsController {
    private readonly tenantsService;
    constructor(tenantsService: TenantsService);
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
