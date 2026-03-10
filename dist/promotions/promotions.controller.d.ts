import { PromotionsService } from './promotions.service.js';
import { CreatePromotionDto } from './dto/create-promotion.dto.js';
import { UpdatePromotionDto } from './dto/update-promotion.dto.js';
export declare class PromotionsController {
    private readonly promotionsService;
    constructor(promotionsService: PromotionsService);
    create(dto: CreatePromotionDto, tenantId: string): Promise<import("./entities/promotion.entity.js").Promotion>;
    findAll(tenantId: string): Promise<import("./entities/promotion.entity.js").Promotion[]>;
    findActive(tenantId: string): Promise<import("./entities/promotion.entity.js").Promotion[]>;
    findOne(id: string, tenantId: string): Promise<import("./entities/promotion.entity.js").Promotion>;
    update(id: string, dto: UpdatePromotionDto, tenantId: string): Promise<import("./entities/promotion.entity.js").Promotion>;
    remove(id: string, tenantId: string): Promise<void>;
}
