import { Repository } from 'typeorm';
import { Promotion } from './entities/promotion.entity.js';
import { CreatePromotionDto } from './dto/create-promotion.dto.js';
import { UpdatePromotionDto } from './dto/update-promotion.dto.js';
export declare class PromotionsService {
    private readonly promotionRepository;
    constructor(promotionRepository: Repository<Promotion>);
    create(dto: CreatePromotionDto, tenantId: string): Promise<Promotion>;
    findAll(tenantId: string): Promise<Promotion[]>;
    findOne(id: string, tenantId: string): Promise<Promotion>;
    findActive(tenantId: string): Promise<Promotion[]>;
    update(id: string, dto: UpdatePromotionDto, tenantId: string): Promise<Promotion>;
    remove(id: string, tenantId: string): Promise<void>;
}
