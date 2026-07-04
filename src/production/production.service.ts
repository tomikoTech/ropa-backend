import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Production } from './entities/production.entity.js';
import { ProductionItem } from './entities/production-item.entity.js';
import { Stock } from '../inventory/entities/stock.entity.js';
import { StockMovement } from '../inventory/entities/stock-movement.entity.js';
import { ProductVariant } from '../products/entities/product-variant.entity.js';
import { MovementType } from '../common/enums/movement-type.enum.js';
import { CreateProductionDto } from './dto/create-production.dto.js';

@Injectable()
export class ProductionService {
  constructor(
    @InjectRepository(Production)
    private readonly productionRepo: Repository<Production>,
    private readonly dataSource: DataSource,
  ) {}

  async create(
    dto: CreateProductionDto,
    userId: string,
    tenantId: string,
  ): Promise<Production> {
    if (dto.producedVariantId && !dto.producedQuantity) {
      throw new BadRequestException(
        'Indica la cantidad de lociones producidas',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const stockRepo = manager.getRepository(Stock);
      const movementRepo = manager.getRepository(StockMovement);
      const variantRepo = manager.getRepository(ProductVariant);
      const productionRepo = manager.getRepository(Production);
      const itemRepo = manager.getRepository(ProductionItem);

      // Crear la producción
      const production = productionRepo.create({
        warehouseId: dto.warehouseId,
        producedVariantId: dto.producedVariantId ?? null,
        producedQuantity: dto.producedQuantity ?? 0,
        notes: dto.notes,
        createdById: userId,
        tenantId,
      });
      const saved = await productionRepo.save(production);

      // Consumir esencias (OUT)
      for (const item of dto.items) {
        const variant = await variantRepo.findOne({
          where: { id: item.variantId, tenantId },
        });
        if (!variant) {
          throw new NotFoundException(
            `Esencia ${item.variantId} no encontrada`,
          );
        }

        const stock = await stockRepo.findOne({
          where: {
            variantId: item.variantId,
            warehouseId: dto.warehouseId,
            tenantId,
          },
        });
        const available = stock ? Number(stock.quantity) : 0;
        if (available < item.quantity) {
          throw new BadRequestException(
            `Esencia "${variant.sku}": stock insuficiente (disponible ${available} ml, requerido ${item.quantity} ml)`,
          );
        }
        stock!.quantity = available - item.quantity;
        await stockRepo.save(stock!);

        await movementRepo.save(
          movementRepo.create({
            variantId: item.variantId,
            warehouseId: dto.warehouseId,
            movementType: MovementType.OUT,
            quantity: item.quantity,
            referenceType: 'PRODUCTION',
            referenceId: saved.id,
            notes: 'Consumo de esencia (producción)',
            createdById: userId,
            tenantId,
          }),
        );

        await itemRepo.save(
          itemRepo.create({
            productionId: saved.id,
            variantId: item.variantId,
            quantity: item.quantity,
            tenantId,
          }),
        );
      }

      // Producir loción (IN) — opcional
      if (dto.producedVariantId && dto.producedQuantity) {
        const locion = await variantRepo.findOne({
          where: { id: dto.producedVariantId, tenantId },
        });
        if (!locion) {
          throw new NotFoundException('Loción a producir no encontrada');
        }

        let stock = await stockRepo.findOne({
          where: {
            variantId: dto.producedVariantId,
            warehouseId: dto.warehouseId,
            tenantId,
          },
        });
        if (!stock) {
          stock = stockRepo.create({
            variantId: dto.producedVariantId,
            warehouseId: dto.warehouseId,
            tenantId,
            quantity: 0,
            minStock: 0,
          });
        }
        stock.quantity = Number(stock.quantity) + dto.producedQuantity;
        await stockRepo.save(stock);

        await movementRepo.save(
          movementRepo.create({
            variantId: dto.producedVariantId,
            warehouseId: dto.warehouseId,
            movementType: MovementType.IN,
            quantity: dto.producedQuantity,
            referenceType: 'PRODUCTION',
            referenceId: saved.id,
            notes: 'Producción de loción',
            createdById: userId,
            tenantId,
          }),
        );
      }

      const full = await productionRepo.findOne({
        where: { id: saved.id, tenantId },
        relations: ['items'],
      });
      return full!;
    });
  }

  async findAll(tenantId: string): Promise<Production[]> {
    return this.productionRepo.find({
      where: { tenantId },
      relations: ['items'],
      order: { createdAt: 'DESC' },
      take: 200,
    });
  }

  async findOne(id: string, tenantId: string): Promise<Production> {
    const production = await this.productionRepo.findOne({
      where: { id, tenantId },
      relations: ['items'],
    });
    if (!production) throw new NotFoundException('Producción no encontrada');
    return production;
  }
}
