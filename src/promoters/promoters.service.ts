import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Promoter } from './promoter.entity.js';
import { CreatePromoterDto, UpdatePromoterDto } from './promoters.dto.js';

@Injectable()
export class PromotersService {
  constructor(
    @InjectRepository(Promoter) private readonly repo: Repository<Promoter>,
  ) {}

  findAll(tenantId: string, includeInactive = false) {
    return this.repo.find({
      where: { tenantId, ...(includeInactive ? {} : { isActive: true }) },
      order: { name: 'ASC' },
    });
  }

  create(dto: CreatePromoterDto, tenantId: string) {
    return this.repo.save(
      this.repo.create({
        tenantId,
        name: dto.name.trim(),
        phone: dto.phone?.trim() || null,
      }),
    );
  }

  async update(id: string, dto: UpdatePromoterDto, tenantId: string) {
    const promoter = await this.repo.findOne({ where: { id, tenantId } });
    if (!promoter) throw new NotFoundException('Impulsador no encontrado');
    if (dto.name !== undefined) promoter.name = dto.name.trim();
    if (dto.phone !== undefined) promoter.phone = dto.phone.trim() || null;
    if (dto.isActive !== undefined) promoter.isActive = dto.isActive;
    return this.repo.save(promoter);
  }
}
