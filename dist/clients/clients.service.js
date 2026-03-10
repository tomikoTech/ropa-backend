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
exports.ClientsService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const client_entity_js_1 = require("./entities/client.entity.js");
let ClientsService = class ClientsService {
    clientRepository;
    constructor(clientRepository) {
        this.clientRepository = clientRepository;
    }
    async create(dto, tenantId) {
        if (dto.documentNumber) {
            const existing = await this.clientRepository.findOne({
                where: { documentNumber: dto.documentNumber, tenantId },
            });
            if (existing) {
                throw new common_1.ConflictException('Ya existe un cliente con ese número de documento');
            }
        }
        const client = this.clientRepository.create({ ...dto, tenantId });
        return this.clientRepository.save(client);
    }
    async findAll(tenantId) {
        return this.clientRepository.find({
            where: { tenantId },
            order: { createdAt: 'DESC' },
        });
    }
    async findOne(id, tenantId) {
        const client = await this.clientRepository.findOne({
            where: { id, tenantId },
        });
        if (!client) {
            throw new common_1.NotFoundException('Cliente no encontrado');
        }
        return client;
    }
    async findGeneric(tenantId) {
        const generic = await this.clientRepository.findOne({
            where: { isGeneric: true, tenantId },
        });
        if (!generic) {
            throw new common_1.NotFoundException('Cliente genérico no encontrado. Ejecutar seed.');
        }
        return generic;
    }
    async search(query, tenantId) {
        return this.clientRepository
            .createQueryBuilder('c')
            .where('c.is_active = true')
            .andWhere('c.tenant_id = :tenantId', { tenantId })
            .andWhere('(c.first_name ILIKE :q OR c.last_name ILIKE :q OR c.document_number ILIKE :q OR c.phone ILIKE :q)', { q: `%${query}%` })
            .limit(20)
            .getMany();
    }
    async update(id, dto, tenantId) {
        const client = await this.findOne(id, tenantId);
        if (client.isGeneric) {
            throw new common_1.BadRequestException('No se puede editar el cliente genérico');
        }
        if (dto.documentNumber && dto.documentNumber !== client.documentNumber) {
            const existing = await this.clientRepository.findOne({
                where: { documentNumber: dto.documentNumber, tenantId },
            });
            if (existing) {
                throw new common_1.ConflictException('Ya existe un cliente con ese número de documento');
            }
        }
        Object.assign(client, dto);
        return this.clientRepository.save(client);
    }
    async remove(id, tenantId) {
        const client = await this.findOne(id, tenantId);
        if (client.isGeneric) {
            throw new common_1.BadRequestException('No se puede eliminar el cliente genérico');
        }
        await this.clientRepository.remove(client);
    }
};
exports.ClientsService = ClientsService;
exports.ClientsService = ClientsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(client_entity_js_1.Client)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], ClientsService);
//# sourceMappingURL=clients.service.js.map