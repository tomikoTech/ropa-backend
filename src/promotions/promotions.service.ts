import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { Promotion } from './entities/promotion.entity.js';
import { CreatePromotionDto } from './dto/create-promotion.dto.js';
import { UpdatePromotionDto } from './dto/update-promotion.dto.js';

@Injectable()
export class PromotionsService {
  constructor(
    @InjectRepository(Promotion)
    private readonly promotionRepository: Repository<Promotion>,
  ) {}

  async create(dto: CreatePromotionDto, tenantId: string): Promise<Promotion> {
    const promotion = this.promotionRepository.create({
      ...dto,
      applicableTo: dto.applicableTo || 'ALL',
      startDate: new Date(dto.startDate),
      endDate: new Date(dto.endDate),
      tenantId,
    });
    return this.promotionRepository.save(promotion);
  }

  async findAll(tenantId: string): Promise<Promotion[]> {
    return this.promotionRepository.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string, tenantId: string): Promise<Promotion> {
    const promotion = await this.promotionRepository.findOne({ where: { id, tenantId } });
    if (!promotion) {
      throw new NotFoundException('Promoción no encontrada');
    }
    return promotion;
  }

  async findActive(tenantId: string): Promise<Promotion[]> {
    const now = new Date();
    return this.promotionRepository.find({
      where: {
        isActive: true,
        startDate: LessThanOrEqual(now),
        endDate: MoreThanOrEqual(now),
        tenantId,
      },
      order: { discountValue: 'DESC' },
    });
  }

  async update(id: string, dto: UpdatePromotionDto, tenantId: string): Promise<Promotion> {
    const promotion = await this.findOne(id, tenantId);
    if (dto.startDate) (dto as any).startDate = new Date(dto.startDate);
    if (dto.endDate) (dto as any).endDate = new Date(dto.endDate);
    Object.assign(promotion, dto);
    return this.promotionRepository.save(promotion);
  }

  async remove(id: string, tenantId: string): Promise<void> {
    const promotion = await this.findOne(id, tenantId);
    await this.promotionRepository.remove(promotion);
  }
}
