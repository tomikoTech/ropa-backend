import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { SizeCurve } from './entities/size-curve.entity.js';
import { SizeCurveItem } from './entities/size-curve-item.entity.js';
import { SizeCurveType } from './entities/size-curve-type.entity.js';
import { Size } from './entities/size.entity.js';
import {
  CreateSizeCurveDto,
  UpdateSizeCurveDto,
  SizeCurveItemDto,
} from './dto/size-curve.dto.js';

/** Curva con su total calculado y los ítems en orden natural de talla. */
export interface SizeCurveView extends SizeCurve {
  totalUnits: number;
}

@Injectable()
export class SizeCurvesService {
  constructor(
    @InjectRepository(SizeCurve)
    private readonly curveRepo: Repository<SizeCurve>,
    @InjectRepository(SizeCurveItem)
    private readonly itemRepo: Repository<SizeCurveItem>,
    @InjectRepository(SizeCurveType)
    private readonly typeRepo: Repository<SizeCurveType>,
    @InjectRepository(Size)
    private readonly sizeRepo: Repository<Size>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Valida los renglones de una curva.
   *
   * Comprueba que **todas las tallas existan y sean del tenant**: sin esto se
   * podría armar una curva con la talla de otra tienda pasando su id.
   * También rechaza tallas repetidas, que dejarían la curva ambigua.
   */
  private async validateItems(
    items: SizeCurveItemDto[],
    tenantId: string,
  ): Promise<void> {
    const ids = items.map((i) => i.sizeId);
    const unique = new Set(ids);
    if (unique.size !== ids.length) {
      throw new BadRequestException(
        'La curva no puede repetir la misma talla dos veces',
      );
    }

    const found = await this.sizeRepo.find({
      where: { id: In(ids), tenantId },
    });
    if (found.length !== unique.size) {
      throw new BadRequestException(
        'La curva incluye tallas que no existen en el catálogo',
      );
    }
  }

  private async assertTypeExists(
    curveTypeId: string | undefined | null,
    tenantId: string,
  ): Promise<void> {
    if (!curveTypeId) return;
    const type = await this.typeRepo.findOne({
      where: { id: curveTypeId, tenantId },
    });
    if (!type) throw new NotFoundException('Familia de curvas no encontrada');
  }

  /** Ordena por el orden natural de la talla y calcula el total de la caja. */
  private toView(curve: SizeCurve): SizeCurveView {
    const items = [...(curve.items ?? [])].sort(
      (a, b) =>
        (a.size?.sortOrder ?? 0) - (b.size?.sortOrder ?? 0) ||
        (a.size?.name ?? '').localeCompare(b.size?.name ?? ''),
    );
    return {
      ...curve,
      items,
      totalUnits: items.reduce((sum, i) => sum + i.quantity, 0),
    };
  }

  async create(
    dto: CreateSizeCurveDto,
    tenantId: string,
  ): Promise<SizeCurveView> {
    const name = dto.name.trim();
    const dup = await this.curveRepo.findOne({ where: { tenantId, name } });
    if (dup) throw new ConflictException('Ya existe una curva con ese nombre');

    await this.assertTypeExists(dto.curveTypeId, tenantId);
    await this.validateItems(dto.items, tenantId);

    const saved = await this.dataSource.transaction(async (m) => {
      const curve = await m.getRepository(SizeCurve).save(
        m.getRepository(SizeCurve).create({
          name,
          curveTypeId: dto.curveTypeId ?? null,
          isActive: dto.isActive ?? true,
          tenantId,
        }),
      );
      await m.getRepository(SizeCurveItem).save(
        dto.items.map((i) =>
          m.getRepository(SizeCurveItem).create({
            curveId: curve.id,
            sizeId: i.sizeId,
            quantity: i.quantity,
            tenantId,
          }),
        ),
      );
      return curve;
    });

    return this.findOne(saved.id, tenantId);
  }

  async findAll(tenantId: string): Promise<SizeCurveView[]> {
    const curves = await this.curveRepo.find({
      where: { tenantId },
      relations: { items: true, curveType: true },
      order: { name: 'ASC' },
    });
    return curves.map((c) => this.toView(c));
  }

  async findOne(id: string, tenantId: string): Promise<SizeCurveView> {
    const curve = await this.curveRepo.findOne({
      where: { id, tenantId },
      relations: { items: true, curveType: true },
    });
    if (!curve) throw new NotFoundException('Curva no encontrada');
    return this.toView(curve);
  }

  async update(
    id: string,
    dto: UpdateSizeCurveDto,
    tenantId: string,
  ): Promise<SizeCurveView> {
    const curve = await this.curveRepo.findOne({ where: { id, tenantId } });
    if (!curve) throw new NotFoundException('Curva no encontrada');

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (name !== curve.name) {
        const dup = await this.curveRepo.findOne({ where: { tenantId, name } });
        if (dup)
          throw new ConflictException('Ya existe una curva con ese nombre');
        curve.name = name;
      }
    }
    if (dto.curveTypeId !== undefined) {
      await this.assertTypeExists(dto.curveTypeId, tenantId);
      curve.curveTypeId = dto.curveTypeId ?? null;
    }
    if (dto.isActive !== undefined) curve.isActive = dto.isActive;
    if (dto.items) await this.validateItems(dto.items, tenantId);

    await this.dataSource.transaction(async (m) => {
      await m.getRepository(SizeCurve).save(curve);
      if (dto.items) {
        // Se reemplaza el detalle completo: es más simple y predecible que
        // reconciliar altas/bajas/cambios renglón por renglón.
        await m.getRepository(SizeCurveItem).delete({ curveId: curve.id });
        await m.getRepository(SizeCurveItem).save(
          dto.items.map((i) =>
            m.getRepository(SizeCurveItem).create({
              curveId: curve.id,
              sizeId: i.sizeId,
              quantity: i.quantity,
              tenantId,
            }),
          ),
        );
      }
    });

    return this.findOne(id, tenantId);
  }

  /** Duplica una curva con otro nombre: es como se arman las variantes de una familia. */
  async duplicate(
    id: string,
    newName: string,
    tenantId: string,
  ): Promise<SizeCurveView> {
    const source = await this.findOne(id, tenantId);
    return this.create(
      {
        name: newName,
        curveTypeId: source.curveTypeId ?? undefined,
        items: source.items.map((i) => ({
          sizeId: i.sizeId,
          quantity: i.quantity,
        })),
      },
      tenantId,
    );
  }

  async remove(id: string, tenantId: string): Promise<{ success: true }> {
    const curve = await this.curveRepo.findOne({ where: { id, tenantId } });
    if (!curve) throw new NotFoundException('Curva no encontrada');
    // Los renglones se van en cascada (no existen fuera de su curva).
    await this.curveRepo.delete({ id, tenantId });
    return { success: true };
  }

  /** Cuántas curvas usan una talla. Lo consulta el catálogo antes de borrarla. */
  async countBySize(sizeId: string, tenantId: string): Promise<number> {
    return this.itemRepo.count({ where: { sizeId, tenantId } });
  }
}
