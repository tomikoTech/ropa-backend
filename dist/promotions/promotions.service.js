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
exports.PromotionsService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const promotion_entity_js_1 = require("./entities/promotion.entity.js");
let PromotionsService = class PromotionsService {
    promotionRepository;
    constructor(promotionRepository) {
        this.promotionRepository = promotionRepository;
    }
    async create(dto, tenantId) {
        const promotion = this.promotionRepository.create({
            ...dto,
            applicableTo: dto.applicableTo || 'ALL',
            startDate: new Date(dto.startDate),
            endDate: new Date(dto.endDate),
            tenantId,
        });
        return this.promotionRepository.save(promotion);
    }
    async findAll(tenantId) {
        return this.promotionRepository.find({
            where: { tenantId },
            order: { createdAt: 'DESC' },
        });
    }
    async findOne(id, tenantId) {
        const promotion = await this.promotionRepository.findOne({
            where: { id, tenantId },
        });
        if (!promotion) {
            throw new common_1.NotFoundException('Promoción no encontrada');
        }
        return promotion;
    }
    async findActive(tenantId) {
        const now = new Date();
        return this.promotionRepository.find({
            where: {
                isActive: true,
                startDate: (0, typeorm_2.LessThanOrEqual)(now),
                endDate: (0, typeorm_2.MoreThanOrEqual)(now),
                tenantId,
            },
            order: { discountValue: 'DESC' },
        });
    }
    async update(id, dto, tenantId) {
        const promotion = await this.findOne(id, tenantId);
        if (dto.startDate)
            dto.startDate = new Date(dto.startDate);
        if (dto.endDate)
            dto.endDate = new Date(dto.endDate);
        Object.assign(promotion, dto);
        return this.promotionRepository.save(promotion);
    }
    async remove(id, tenantId) {
        const promotion = await this.findOne(id, tenantId);
        await this.promotionRepository.remove(promotion);
    }
};
exports.PromotionsService = PromotionsService;
exports.PromotionsService = PromotionsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(promotion_entity_js_1.Promotion)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], PromotionsService);
//# sourceMappingURL=promotions.service.js.map