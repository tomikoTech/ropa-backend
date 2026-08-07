import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SizeCurveType } from './entities/size-curve-type.entity.js';
import { SizeCurve } from './entities/size-curve.entity.js';
import {
  CreateSizeCurveTypeDto,
  UpdateSizeCurveTypeDto,
} from './dto/size-curve.dto.js';

@Injectable()
export class SizeCurveTypesService {
  constructor(
    @InjectRepository(SizeCurveType)
    private readonly typeRepo: Repository<SizeCurveType>,
    @InjectRepository(SizeCurve)
    private readonly curveRepo: Repository<SizeCurve>,
  ) {}

  async create(
    dto: CreateSizeCurveTypeDto,
    tenantId: string,
  ): Promise<SizeCurveType> {
    const name = dto.name.trim();
    const dup = await this.typeRepo.findOne({ where: { tenantId, name } });
    if (dup)
      throw new ConflictException('Ya existe una familia con ese nombre');
    return this.typeRepo.save(
      this.typeRepo.create({ name, isActive: dto.isActive ?? true, tenantId }),
    );
  }

  /** Familias con cuántas curvas tiene cada una. */
  async findAll(
    tenantId: string,
  ): Promise<(SizeCurveType & { curveCount: number })[]> {
    const types = await this.typeRepo.find({
      where: { tenantId },
      order: { name: 'ASC' },
    });
    const counts = await this.curveRepo
      .createQueryBuilder('c')
      .select('c.curveTypeId', 'curveTypeId')
      .addSelect('COUNT(*)', 'count')
      .where('c.tenantId = :tenantId', { tenantId })
      .andWhere('c.curveTypeId IS NOT NULL')
      .groupBy('c.curveTypeId')
      .getRawMany<{ curveTypeId: string; count: string }>();
    const byId = new Map(counts.map((c) => [c.curveTypeId, Number(c.count)]));
    return types.map((t) => ({ ...t, curveCount: byId.get(t.id) ?? 0 }));
  }

  async update(
    id: string,
    dto: UpdateSizeCurveTypeDto,
    tenantId: string,
  ): Promise<SizeCurveType> {
    const type = await this.typeRepo.findOne({ where: { id, tenantId } });
    if (!type) throw new NotFoundException('Familia no encontrada');

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (name !== type.name) {
        const dup = await this.typeRepo.findOne({ where: { tenantId, name } });
        if (dup)
          throw new ConflictException('Ya existe una familia con ese nombre');
        type.name = name;
      }
    }
    if (dto.isActive !== undefined) type.isActive = dto.isActive;
    return this.typeRepo.save(type);
  }

  /**
   * Elimina la familia. Las curvas que la usaban quedan sin familia
   * (`ON DELETE SET NULL`): borrar una agrupación no debe borrar el contenido.
   */
  async remove(id: string, tenantId: string): Promise<{ success: true }> {
    const type = await this.typeRepo.findOne({ where: { id, tenantId } });
    if (!type) throw new NotFoundException('Familia no encontrada');
    await this.typeRepo.delete({ id, tenantId });
    return { success: true };
  }
}
