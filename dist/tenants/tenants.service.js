"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TenantsService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const bcrypt = __importStar(require("bcrypt"));
const tenant_entity_js_1 = require("./entities/tenant.entity.js");
const user_entity_js_1 = require("../users/entities/user.entity.js");
const warehouse_entity_js_1 = require("../inventory/entities/warehouse.entity.js");
const client_entity_js_1 = require("../clients/entities/client.entity.js");
const store_settings_entity_js_1 = require("../storefront/entities/store-settings.entity.js");
const role_enum_js_1 = require("../common/enums/role.enum.js");
const document_type_enum_js_1 = require("../common/enums/document-type.enum.js");
let TenantsService = class TenantsService {
    tenantRepo;
    dataSource;
    constructor(tenantRepo, dataSource) {
        this.tenantRepo = tenantRepo;
        this.dataSource = dataSource;
    }
    async create(data) {
        const existing = await this.tenantRepo.findOne({ where: { slug: data.slug } });
        if (existing) {
            throw new common_1.ConflictException('Slug ya existe');
        }
        return this.tenantRepo.save(this.tenantRepo.create(data));
    }
    async findAll() {
        return this.tenantRepo.find({ order: { createdAt: 'DESC' } });
    }
    async findOne(id) {
        const tenant = await this.tenantRepo.findOne({ where: { id } });
        if (!tenant)
            throw new common_1.NotFoundException('Tenant no encontrado');
        return tenant;
    }
    async update(id, data) {
        const tenant = await this.findOne(id);
        Object.assign(tenant, data);
        return this.tenantRepo.save(tenant);
    }
    async remove(id) {
        const tenant = await this.findOne(id);
        await this.tenantRepo.remove(tenant);
    }
    async onboardStore(dto) {
        const slug = dto.storeName
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
        const existingTenant = await this.tenantRepo.findOne({ where: { slug } });
        if (existingTenant) {
            throw new common_1.ConflictException(`Ya existe una tienda con slug "${slug}"`);
        }
        const userRepo = this.dataSource.getRepository(user_entity_js_1.User);
        const existingUser = await userRepo.findOne({ where: { email: dto.adminEmail } });
        if (existingUser) {
            throw new common_1.ConflictException(`El email "${dto.adminEmail}" ya está registrado`);
        }
        return this.dataSource.transaction(async (manager) => {
            const tenantRepo = manager.getRepository(tenant_entity_js_1.Tenant);
            const uRepo = manager.getRepository(user_entity_js_1.User);
            const warehouseRepo = manager.getRepository(warehouse_entity_js_1.Warehouse);
            const clientRepo = manager.getRepository(client_entity_js_1.Client);
            const settingsRepo = manager.getRepository(store_settings_entity_js_1.StoreSettings);
            const tenant = await tenantRepo.save(tenantRepo.create({ name: dto.storeName, slug }));
            const tenantId = tenant.id;
            const passwordHash = await bcrypt.hash(dto.adminPassword, 10);
            const admin = await uRepo.save(uRepo.create({
                email: dto.adminEmail,
                passwordHash,
                firstName: 'Admin',
                lastName: dto.storeName,
                role: role_enum_js_1.Role.ADMIN,
                isActive: true,
                tenantId,
            }));
            const warehouse = await warehouseRepo.save(warehouseRepo.create({
                name: `${dto.storeName} Principal`,
                code: `${slug.slice(0, 6).toUpperCase()}-01`,
                address: '',
                isPosLocation: true,
                tenantId,
            }));
            const storeSlug = slug;
            await settingsRepo.save(settingsRepo.create({
                storeName: dto.storeName,
                storeSlug,
                heroTitle: dto.storeName.toUpperCase() + '.',
                heroSubtitle: 'TU ESTILO.',
                accentColor: dto.accentColor || '#2563eb',
                whatsappNumber: dto.whatsappNumber || '',
                aboutText: `Bienvenido a ${dto.storeName}.`,
                isStorefrontActive: true,
                defaultWarehouseId: warehouse.id,
                tenantId,
            }));
            await clientRepo.save(clientRepo.create({
                firstName: 'Consumidor',
                lastName: 'Final',
                documentType: document_type_enum_js_1.DocumentType.CC,
                documentNumber: '0000000000',
                isGeneric: true,
                tenantId,
            }));
            return {
                tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
                admin: { email: admin.email },
                storeSlug,
                warehouse: { id: warehouse.id, name: warehouse.name },
            };
        });
    }
};
exports.TenantsService = TenantsService;
exports.TenantsService = TenantsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(tenant_entity_js_1.Tenant)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.DataSource])
], TenantsService);
//# sourceMappingURL=tenants.service.js.map