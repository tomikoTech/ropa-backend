import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Color } from './entities/color.entity.js';
import { ProductVariant } from '../products/entities/product-variant.entity.js';
import { CreateColorDto } from './dto/create-color.dto.js';
import { UpdateColorDto } from './dto/update-color.dto.js';

@Injectable()
export class ColorsService {
  constructor(
    @InjectRepository(Color)
    private readonly colorRepo: Repository<Color>,
    @InjectRepository(ProductVariant)
    private readonly variantRepo: Repository<ProductVariant>,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateColorDto, tenantId: string): Promise<Color> {
    const name = dto.name.trim();
    const existing = await this.colorRepo.findOne({
      where: { tenantId, name },
    });
    if (existing) {
      throw new ConflictException('Ya existe un color con ese nombre');
    }
    const color = this.colorRepo.create({
      name,
      hex: dto.hex || null,
      isActive: dto.isActive ?? true,
      tenantId,
    });
    return this.colorRepo.save(color);
  }

  /** Lista los colores con cuántas variantes usan cada uno. */
  async findAll(
    tenantId: string,
  ): Promise<(Color & { variantCount: number })[]> {
    const colors = await this.colorRepo.find({
      where: { tenantId },
      order: { name: 'ASC' },
    });
    // Se cuenta por FK (la fuente de verdad), no por el texto heredado.
    const counts = await this.variantRepo
      .createQueryBuilder('v')
      .select('v.colorId', 'colorId')
      .addSelect('COUNT(*)', 'count')
      .where('v.tenantId = :tenantId', { tenantId })
      .andWhere('v.colorId IS NOT NULL')
      .groupBy('v.colorId')
      .getRawMany<{ colorId: string; count: string }>();
    const byId = new Map(counts.map((c) => [c.colorId, Number(c.count)]));
    return colors.map((c) => ({ ...c, variantCount: byId.get(c.id) ?? 0 }));
  }

  async findOne(id: string, tenantId: string): Promise<Color> {
    const color = await this.colorRepo.findOne({ where: { id, tenantId } });
    if (!color) throw new NotFoundException('Color no encontrado');
    return color;
  }

  /**
   * Actualiza el color. Como las variantes lo referencian por FK, renombrar
   * es una sola escritura; solo se propaga la copia de texto heredada.
   */
  async update(
    id: string,
    dto: UpdateColorDto,
    tenantId: string,
  ): Promise<Color> {
    const color = await this.findOne(id, tenantId);
    const newName = dto.name?.trim();

    const applyRest = () => {
      if (dto.hex !== undefined) color.hex = dto.hex || null;
      if (dto.isActive !== undefined) color.isActive = dto.isActive;
    };

    if (newName && newName !== color.name) {
      const dup = await this.colorRepo.findOne({
        where: { tenantId, name: newName },
      });
      if (dup) throw new ConflictException('Ya existe un color con ese nombre');

      // Con la FK, renombrar es UNA fila (ver SizesService). La copia de texto
      // heredada se sincroniza solo hasta el paso CONTRACT.
      await this.dataSource.transaction(async (m) => {
        color.name = newName;
        applyRest();
        await m.getRepository(Color).save(color);
        await m
          .getRepository(ProductVariant)
          .update({ tenantId, colorId: color.id }, { color: newName });
      });
      return color;
    }

    applyRest();
    return this.colorRepo.save(color);
  }

  /**
   * Elimina el color del catálogo.
   *
   * Igual que en tallas: la FK es `ON DELETE RESTRICT`, así que se comprueba el
   * uso antes para dar un mensaje accionable en vez de un error de integridad.
   */
  async remove(id: string, tenantId: string): Promise<{ success: true }> {
    const color = await this.findOne(id, tenantId);
    const inUse = await this.variantRepo.count({
      where: { tenantId, colorId: color.id },
    });
    if (inUse > 0) {
      throw new ConflictException(
        `No se puede eliminar el color "${color.name}": lo usan ${inUse} variante(s). ` +
          'Cámbialas de color o desactívalo en lugar de eliminarlo.',
      );
    }
    await this.colorRepo.delete({ id: color.id, tenantId });
    return { success: true };
  }

  /** Garantiza que el color exista en el catálogo (sin fallar si ya existe). */
  async ensure(
    name: string | undefined | null,
    tenantId: string,
  ): Promise<Color | null> {
    const n = (name || '').trim();
    if (!n) return null;
    const existing = await this.colorRepo.findOne({
      where: { tenantId, name: n },
    });
    if (existing) return existing;
    return this.colorRepo.save(this.colorRepo.create({ name: n, tenantId }));
  }
}
