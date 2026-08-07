import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Size } from './entities/size.entity.js';
import { ProductVariant } from '../products/entities/product-variant.entity.js';
import { CreateSizeDto } from './dto/create-size.dto.js';
import { UpdateSizeDto } from './dto/update-size.dto.js';

/**
 * Deduce el orden natural de una talla a partir de su nombre.
 *
 * Las tallas mezclan números ("38", "10.5") y letras ("S", "M", "XL"), y el
 * orden alfabético las rompe ("10" iría antes que "9"). Se resuelve en tres
 * tramos para que numéricas, alfabéticas conocidas y el resto no se pisen.
 */
export function deriveSortOrder(name: string): number {
  const n = (name || '').trim().toUpperCase();

  const numeric = Number(n.replace(',', '.'));
  if (!Number.isNaN(numeric) && n !== '') {
    return Math.round(numeric * 10); // 38 -> 380, 38.5 -> 385
  }

  const letters = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
  const idx = letters.indexOf(n);
  if (idx >= 0) return 10_000 + idx * 10;

  return 20_000; // sin orden conocido: al final, luego alfabético
}

@Injectable()
export class SizesService {
  constructor(
    @InjectRepository(Size)
    private readonly sizeRepo: Repository<Size>,
    @InjectRepository(ProductVariant)
    private readonly variantRepo: Repository<ProductVariant>,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateSizeDto, tenantId: string): Promise<Size> {
    const name = dto.name.trim();
    const existing = await this.sizeRepo.findOne({ where: { tenantId, name } });
    if (existing) {
      throw new ConflictException('Ya existe una talla con ese nombre');
    }
    const size = this.sizeRepo.create({
      name,
      sizeGroup: dto.sizeGroup?.trim() || null,
      sortOrder: dto.sortOrder ?? deriveSortOrder(name),
      isActive: dto.isActive ?? true,
      tenantId,
    });
    return this.sizeRepo.save(size);
  }

  /** Lista las tallas en orden natural, con cuántas variantes usan cada una. */
  async findAll(
    tenantId: string,
  ): Promise<(Size & { variantCount: number })[]> {
    const sizes = await this.sizeRepo.find({
      where: { tenantId },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
    // Se cuenta por FK (la fuente de verdad), no por el texto heredado.
    const counts = await this.variantRepo
      .createQueryBuilder('v')
      .select('v.sizeId', 'sizeId')
      .addSelect('COUNT(*)', 'count')
      .where('v.tenantId = :tenantId', { tenantId })
      .andWhere('v.sizeId IS NOT NULL')
      .groupBy('v.sizeId')
      .getRawMany<{ sizeId: string; count: string }>();
    const byId = new Map(counts.map((c) => [c.sizeId, Number(c.count)]));
    return sizes.map((s) => ({ ...s, variantCount: byId.get(s.id) ?? 0 }));
  }

  async findOne(id: string, tenantId: string): Promise<Size> {
    const size = await this.sizeRepo.findOne({ where: { id, tenantId } });
    if (!size) throw new NotFoundException('Talla no encontrada');
    return size;
  }

  /**
   * Actualiza la talla. Como las variantes la referencian por FK, renombrar
   * es una sola escritura; solo se propaga la copia de texto heredada.
   */
  async update(
    id: string,
    dto: UpdateSizeDto,
    tenantId: string,
  ): Promise<Size> {
    const size = await this.findOne(id, tenantId);
    const newName = dto.name?.trim();

    const applyRest = () => {
      if (dto.sizeGroup !== undefined)
        size.sizeGroup = dto.sizeGroup?.trim() || null;
      if (dto.sortOrder !== undefined) size.sortOrder = dto.sortOrder;
      if (dto.isActive !== undefined) size.isActive = dto.isActive;
    };

    if (newName && newName !== size.name) {
      const dup = await this.sizeRepo.findOne({
        where: { tenantId, name: newName },
      });
      if (dup)
        throw new ConflictException('Ya existe una talla con ese nombre');

      const oldName = size.name;
      // Con la FK, renombrar es UNA fila: las variantes apuntan por id y ven el
      // nombre nuevo de inmediato. La copia de texto heredada (`variant.size`)
      // se sincroniza solo mientras exista; desaparece en el paso CONTRACT.
      await this.dataSource.transaction(async (m) => {
        size.name = newName;
        // Si el orden venía derivado del nombre anterior, se recalcula.
        if (
          dto.sortOrder === undefined &&
          size.sortOrder === deriveSortOrder(oldName)
        ) {
          size.sortOrder = deriveSortOrder(newName);
        }
        applyRest();
        await m.getRepository(Size).save(size);
        await m
          .getRepository(ProductVariant)
          .update({ tenantId, sizeId: size.id }, { size: newName });
      });
      return size;
    }

    applyRest();
    return this.sizeRepo.save(size);
  }

  /**
   * Elimina la talla del catálogo.
   *
   * Las variantes la referencian por FK con `ON DELETE RESTRICT`, así que si
   * está en uso la base de datos lo impediría. Se comprueba antes para poder
   * dar un mensaje accionable en vez de un error de integridad.
   */
  async remove(id: string, tenantId: string): Promise<{ success: true }> {
    const size = await this.findOne(id, tenantId);
    const inUse = await this.variantRepo.count({
      where: { tenantId, sizeId: size.id },
    });
    if (inUse > 0) {
      throw new ConflictException(
        `No se puede eliminar la talla "${size.name}": la usan ${inUse} variante(s). ` +
          'Cámbialas de talla o desactívala en lugar de eliminarla.',
      );
    }
    await this.sizeRepo.delete({ id: size.id, tenantId });
    return { success: true };
  }

  /**
   * Garantiza que la talla exista en el catálogo (sin fallar si ya existe).
   * La usa el alta de productos/variantes para que el catálogo se mantenga
   * completo sin trabajo manual.
   */
  async ensure(
    name: string | undefined | null,
    tenantId: string,
  ): Promise<Size | null> {
    const n = (name || '').trim();
    if (!n) return null;
    const existing = await this.sizeRepo.findOne({
      where: { tenantId, name: n },
    });
    if (existing) return existing;
    return this.sizeRepo.save(
      this.sizeRepo.create({
        name: n,
        sortOrder: deriveSortOrder(n),
        tenantId,
      }),
    );
  }
}
