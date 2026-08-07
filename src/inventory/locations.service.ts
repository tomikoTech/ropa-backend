import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Shelf } from './entities/shelf.entity.js';
import { Stand } from './entities/stand.entity.js';
import { Warehouse } from './entities/warehouse.entity.js';

export interface ShelfWithStands extends Shelf {
  stands: Stand[];
}

/**
 * Ubicaciones físicas dentro de una bodega: estanterías y sus stands.
 *
 * Se administran juntas porque un stand no existe sin su estantería, y la UI
 * las muestra como un solo árbol.
 */
@Injectable()
export class LocationsService {
  constructor(
    @InjectRepository(Shelf)
    private readonly shelfRepo: Repository<Shelf>,
    @InjectRepository(Stand)
    private readonly standRepo: Repository<Stand>,
    @InjectRepository(Warehouse)
    private readonly warehouseRepo: Repository<Warehouse>,
  ) {}

  private async assertWarehouse(
    warehouseId: string,
    tenantId: string,
  ): Promise<void> {
    const wh = await this.warehouseRepo.findOne({
      where: { id: warehouseId, tenantId },
    });
    if (!wh) throw new NotFoundException('Bodega no encontrada');
  }

  /**
   * Estanterías de una bodega con sus stands.
   *
   * Los stands se traen en **una sola consulta** para todas las estanterías;
   * hacerlo por estantería sería un N+1 en bodegas grandes.
   */
  async findByWarehouse(
    warehouseId: string,
    tenantId: string,
  ): Promise<ShelfWithStands[]> {
    await this.assertWarehouse(warehouseId, tenantId);

    const shelves = await this.shelfRepo.find({
      where: { tenantId, warehouseId },
      order: { name: 'ASC' },
    });
    if (shelves.length === 0) return [];

    const stands = await this.standRepo.find({
      where: { tenantId, shelfId: In(shelves.map((s) => s.id)) },
      order: { name: 'ASC' },
    });
    const byShelf = new Map<string, Stand[]>();
    for (const st of stands) {
      byShelf.set(st.shelfId, [...(byShelf.get(st.shelfId) ?? []), st]);
    }

    return shelves.map((s) => ({ ...s, stands: byShelf.get(s.id) ?? [] }));
  }

  async createShelf(
    warehouseId: string,
    name: string,
    tenantId: string,
  ): Promise<Shelf> {
    await this.assertWarehouse(warehouseId, tenantId);
    const clean = name.trim();
    const dup = await this.shelfRepo.findOne({
      where: { tenantId, warehouseId, name: clean },
    });
    if (dup) {
      throw new ConflictException(
        'Ya existe una estantería con ese nombre en esta bodega',
      );
    }
    return this.shelfRepo.save(
      this.shelfRepo.create({ warehouseId, name: clean, tenantId }),
    );
  }

  async updateShelf(
    id: string,
    dto: { name?: string; isActive?: boolean },
    tenantId: string,
  ): Promise<Shelf> {
    const shelf = await this.shelfRepo.findOne({ where: { id, tenantId } });
    if (!shelf) throw new NotFoundException('Estantería no encontrada');

    if (dto.name !== undefined) {
      const clean = dto.name.trim();
      if (clean !== shelf.name) {
        const dup = await this.shelfRepo.findOne({
          where: { tenantId, warehouseId: shelf.warehouseId, name: clean },
        });
        if (dup) {
          throw new ConflictException(
            'Ya existe una estantería con ese nombre en esta bodega',
          );
        }
        shelf.name = clean;
      }
    }
    if (dto.isActive !== undefined) shelf.isActive = dto.isActive;
    return this.shelfRepo.save(shelf);
  }

  /** Elimina la estantería; sus stands se van en cascada (no existen sin ella). */
  async removeShelf(id: string, tenantId: string): Promise<{ success: true }> {
    const shelf = await this.shelfRepo.findOne({ where: { id, tenantId } });
    if (!shelf) throw new NotFoundException('Estantería no encontrada');
    await this.shelfRepo.delete({ id, tenantId });
    return { success: true };
  }

  async createStand(
    shelfId: string,
    name: string,
    tenantId: string,
  ): Promise<Stand> {
    const shelf = await this.shelfRepo.findOne({
      where: { id: shelfId, tenantId },
    });
    if (!shelf) throw new NotFoundException('Estantería no encontrada');

    const clean = name.trim();
    const dup = await this.standRepo.findOne({
      where: { tenantId, shelfId, name: clean },
    });
    if (dup) {
      throw new ConflictException(
        'Ya existe un stand con ese nombre en esta estantería',
      );
    }
    return this.standRepo.save(
      this.standRepo.create({ shelfId, name: clean, tenantId }),
    );
  }

  async updateStand(
    id: string,
    dto: { name?: string; isActive?: boolean },
    tenantId: string,
  ): Promise<Stand> {
    const stand = await this.standRepo.findOne({ where: { id, tenantId } });
    if (!stand) throw new NotFoundException('Stand no encontrado');

    if (dto.name !== undefined) {
      const clean = dto.name.trim();
      if (clean !== stand.name) {
        const dup = await this.standRepo.findOne({
          where: { tenantId, shelfId: stand.shelfId, name: clean },
        });
        if (dup) {
          throw new ConflictException(
            'Ya existe un stand con ese nombre en esta estantería',
          );
        }
        stand.name = clean;
      }
    }
    if (dto.isActive !== undefined) stand.isActive = dto.isActive;
    return this.standRepo.save(stand);
  }

  async removeStand(id: string, tenantId: string): Promise<{ success: true }> {
    const stand = await this.standRepo.findOne({ where: { id, tenantId } });
    if (!stand) throw new NotFoundException('Stand no encontrado');
    await this.standRepo.delete({ id, tenantId });
    return { success: true };
  }
}
