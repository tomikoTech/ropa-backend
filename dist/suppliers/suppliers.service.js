"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SuppliersService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const supplier_entity_js_1 = require("./entities/supplier.entity.js");
let SuppliersService = class SuppliersService {
    supplierRepository;
    constructor(supplierRepository) {
        this.supplierRepository = supplierRepository;
    }
    async create(dto, tenantId) {
        const existing = await this.supplierRepository.findOne({
            where: { nit: dto.nit, tenantId },
        });
        if (existing) {
            throw new common_1.ConflictException('Ya existe un proveedor con ese NIT');
        }
        const supplier = this.supplierRepository.create({ ...dto, tenantId });
        return this.supplierRepository.save(supplier);
    }
    async findAll(tenantId) {
        return this.supplierRepository.find({
            where: { tenantId },
            order: { createdAt: 'DESC' },
        });
    }
    async findOne(id, tenantId) {
        const supplier = await this.supplierRepository.findOne({
            where: { id, tenantId },
        });
        if (!supplier) {
            throw new common_1.NotFoundException('Proveedor no encontrado');
        }
        return supplier;
    }
    async search(query, tenantId) {
        return this.supplierRepository
            .createQueryBuilder('s')
            .where('s.is_active = true')
            .andWhere('s.tenant_id = :tenantId', { tenantId })
            .andWhere('(s.name ILIKE :q OR s.nit ILIKE :q OR s.contact_name ILIKE :q)', { q: `%${query}%` })
            .limit(20)
            .getMany();
    }
    async update(id, dto, tenantId) {
        const supplier = await this.findOne(id, tenantId);
        if (dto.nit && dto.nit !== supplier.nit) {
            const existing = await this.supplierRepository.findOne({
                where: { nit: dto.nit, tenantId },
            });
            if (existing) {
                throw new common_1.ConflictException('Ya existe un proveedor con ese NIT');
            }
        }
        Object.assign(supplier, dto);
        return this.supplierRepository.save(supplier);
    }
    async remove(id, tenantId) {
        const supplier = await this.findOne(id, tenantId);
        await this.supplierRepository.remove(supplier);
    }
};
exports.SuppliersService = SuppliersService;
exports.SuppliersService = SuppliersService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(supplier_entity_js_1.Supplier)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], SuppliersService);
//# sourceMappingURL=suppliers.service.js.map