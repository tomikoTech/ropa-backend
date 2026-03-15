import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Warehouse } from './entities/warehouse.entity.js';
import { Stock } from './entities/stock.entity.js';
import { StockMovement } from './entities/stock-movement.entity.js';
import { CreateWarehouseDto } from './dto/create-warehouse.dto.js';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto.js';
import { AdjustStockDto } from './dto/adjust-stock.dto.js';
import { TransferStockDto } from './dto/transfer-stock.dto.js';
import { MovementType } from '../common/enums/movement-type.enum.js';

@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(Warehouse)
    private readonly warehouseRepository: Repository<Warehouse>,
    @InjectRepository(Stock)
    private readonly stockRepository: Repository<Stock>,
    @InjectRepository(StockMovement)
    private readonly movementRepository: Repository<StockMovement>,
    private readonly dataSource: DataSource,
  ) {}

  // ─── Warehouses ───

  async createWarehouse(
    dto: CreateWarehouseDto,
    tenantId: string,
  ): Promise<Warehouse> {
    // Auto-generate code if not provided
    let code = dto.code;
    if (!code) {
      const count = await this.warehouseRepository.count({
        where: { tenantId },
      });
      code = `BOD-${String(count + 1).padStart(3, '0')}`;
    }

    const existing = await this.warehouseRepository.findOne({
      where: [
        { name: dto.name, tenantId },
        { code, tenantId },
      ],
    });
    if (existing) {
      throw new ConflictException(
        'Ya existe una bodega con ese nombre o código',
      );
    }
    const warehouse = this.warehouseRepository.create({
      ...dto,
      code,
      tenantId,
    });
    return this.warehouseRepository.save(warehouse);
  }

  async findAllWarehouses(tenantId: string): Promise<Warehouse[]> {
    return this.warehouseRepository.find({
      where: { tenantId },
      order: { name: 'ASC' },
    });
  }

  async findWarehouse(id: string, tenantId: string): Promise<Warehouse> {
    const warehouse = await this.warehouseRepository.findOne({
      where: { id, tenantId },
    });
    if (!warehouse) throw new NotFoundException('Bodega no encontrada');
    return warehouse;
  }

  async updateWarehouse(
    id: string,
    dto: UpdateWarehouseDto,
    tenantId: string,
  ): Promise<Warehouse> {
    const warehouse = await this.findWarehouse(id, tenantId);

    if (dto.name !== undefined) warehouse.name = dto.name;
    if (dto.code !== undefined) warehouse.code = dto.code;
    if (dto.address !== undefined) warehouse.address = dto.address;
    if (dto.isPosLocation !== undefined)
      warehouse.isPosLocation = dto.isPosLocation;
    if (dto.isActive !== undefined) warehouse.isActive = dto.isActive;

    return this.warehouseRepository.save(warehouse);
  }

  async removeWarehouse(id: string, tenantId: string): Promise<void> {
    const warehouse = await this.findWarehouse(id, tenantId);
    await this.warehouseRepository.remove(warehouse);
  }

  // ─── Stock ───

  async getStockByWarehouse(
    warehouseId: string,
    tenantId: string,
  ): Promise<Stock[]> {
    return this.stockRepository.find({
      where: { warehouseId, tenantId },
      relations: ['variant', 'variant.product', 'warehouse'],
      order: { variant: { product: { name: 'ASC' } } },
    });
  }

  async getStockByVariant(
    variantId: string,
    tenantId: string,
  ): Promise<Stock[]> {
    return this.stockRepository.find({
      where: { variantId, tenantId },
      relations: ['variant', 'variant.product', 'warehouse'],
    });
  }

  async getAllStock(tenantId: string): Promise<Stock[]> {
    return this.stockRepository.find({
      where: { tenantId },
      relations: ['variant', 'variant.product', 'warehouse'],
      order: { warehouse: { name: 'ASC' } },
    });
  }

  async getLowStock(tenantId: string): Promise<Stock[]> {
    const all = await this.stockRepository.find({
      where: { tenantId },
      relations: ['variant', 'variant.product', 'warehouse'],
      order: { quantity: 'ASC' },
    });
    return all.filter((s) => s.minStock > 0 && s.quantity <= s.minStock);
  }

  private async getOrCreateStock(
    variantId: string,
    warehouseId: string,
    tenantId: string,
  ): Promise<Stock> {
    let stock = await this.stockRepository.findOne({
      where: { variantId, warehouseId, tenantId },
    });
    if (!stock) {
      stock = this.stockRepository.create({
        variantId,
        warehouseId,
        tenantId,
        quantity: 0,
        minStock: 0,
      });
      stock = await this.stockRepository.save(stock);
    }
    return stock;
  }

  // ─── Stock Adjustments ───

  async adjustStock(
    dto: AdjustStockDto,
    userId: string,
    tenantId: string,
  ): Promise<Stock> {
    return this.dataSource.transaction(async (manager) => {
      const stockRepo = manager.getRepository(Stock);
      const movementRepo = manager.getRepository(StockMovement);

      let stock = await stockRepo.findOne({
        where: {
          variantId: dto.variantId,
          warehouseId: dto.warehouseId,
          tenantId,
        },
      });

      if (!stock) {
        stock = stockRepo.create({
          variantId: dto.variantId,
          warehouseId: dto.warehouseId,
          tenantId,
          quantity: 0,
          minStock: 0,
        });
      }

      switch (dto.movementType) {
        case MovementType.IN:
          stock.quantity += dto.quantity;
          break;
        case MovementType.OUT:
          if (stock.quantity < dto.quantity) {
            throw new BadRequestException(
              `Stock insuficiente. Disponible: ${stock.quantity}`,
            );
          }
          stock.quantity -= dto.quantity;
          break;
        case MovementType.ADJUSTMENT:
          stock.quantity = dto.quantity;
          break;
      }

      await stockRepo.save(stock);

      const movement = movementRepo.create({
        variantId: dto.variantId,
        warehouseId: dto.warehouseId,
        tenantId,
        movementType: dto.movementType,
        quantity: dto.quantity,
        notes: dto.notes,
        createdById: userId,
      });
      await movementRepo.save(movement);

      return stockRepo.findOne({
        where: { id: stock.id },
        relations: ['variant', 'variant.product', 'warehouse'],
      }) as Promise<Stock>;
    });
  }

  // ─── Transfers ───

  async transferStock(
    dto: TransferStockDto,
    userId: string,
    tenantId: string,
  ): Promise<{ from: Stock; to: Stock }> {
    if (dto.fromWarehouseId === dto.toWarehouseId) {
      throw new BadRequestException(
        'La bodega origen y destino deben ser diferentes',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const stockRepo = manager.getRepository(Stock);
      const movementRepo = manager.getRepository(StockMovement);

      // Get or create source stock
      const fromStock = await stockRepo.findOne({
        where: {
          variantId: dto.variantId,
          warehouseId: dto.fromWarehouseId,
          tenantId,
        },
      });

      if (!fromStock || fromStock.quantity < dto.quantity) {
        throw new BadRequestException(
          `Stock insuficiente en bodega origen. Disponible: ${fromStock?.quantity ?? 0}`,
        );
      }

      // Get or create destination stock
      let toStock = await stockRepo.findOne({
        where: {
          variantId: dto.variantId,
          warehouseId: dto.toWarehouseId,
          tenantId,
        },
      });

      if (!toStock) {
        toStock = stockRepo.create({
          variantId: dto.variantId,
          warehouseId: dto.toWarehouseId,
          tenantId,
          quantity: 0,
          minStock: 0,
        });
      }

      fromStock.quantity -= dto.quantity;
      toStock.quantity += dto.quantity;

      await stockRepo.save(fromStock);
      await stockRepo.save(toStock);

      // Record movements
      const outMovement = movementRepo.create({
        variantId: dto.variantId,
        warehouseId: dto.fromWarehouseId,
        tenantId,
        movementType: MovementType.TRANSFER,
        quantity: -dto.quantity,
        referenceType: 'TRANSFER',
        referenceId: dto.toWarehouseId,
        notes: dto.notes || `Traslado a bodega destino`,
        createdById: userId,
      });

      const inMovement = movementRepo.create({
        variantId: dto.variantId,
        warehouseId: dto.toWarehouseId,
        tenantId,
        movementType: MovementType.TRANSFER,
        quantity: dto.quantity,
        referenceType: 'TRANSFER',
        referenceId: dto.fromWarehouseId,
        notes: dto.notes || `Traslado desde bodega origen`,
        createdById: userId,
      });

      await movementRepo.save([outMovement, inMovement]);

      const from = await stockRepo.findOne({
        where: { id: fromStock.id },
        relations: ['variant', 'variant.product', 'warehouse'],
      });
      const to = await stockRepo.findOne({
        where: { id: toStock.id },
        relations: ['variant', 'variant.product', 'warehouse'],
      });

      return { from: from!, to: to! };
    });
  }

  // ─── Movements ───

  async getMovements(
    tenantId: string,
    filters?: {
      warehouseId?: string;
      variantId?: string;
      movementType?: MovementType;
      limit?: number;
    },
  ): Promise<StockMovement[]> {
    const where: Record<string, unknown> = { tenantId };
    if (filters?.warehouseId) where.warehouseId = filters.warehouseId;
    if (filters?.variantId) where.variantId = filters.variantId;
    if (filters?.movementType) where.movementType = filters.movementType;

    return this.movementRepository.find({
      where,
      relations: ['variant', 'variant.product', 'warehouse', 'createdBy'],
      order: { createdAt: 'DESC' },
      take: filters?.limit || 100,
    });
  }

  // ─── Set min stock ───

  async setMinStock(
    variantId: string,
    warehouseId: string,
    minStock: number,
    tenantId: string,
  ): Promise<Stock> {
    const stock = await this.getOrCreateStock(variantId, warehouseId, tenantId);
    stock.minStock = minStock;
    return this.stockRepository.save(stock);
  }
}
