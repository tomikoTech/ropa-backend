import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { ProductEssence } from '../entities/product-essence.entity.js';
import { ProductVariant } from '../entities/product-variant.entity.js';
import { Stock } from '../../inventory/entities/stock.entity.js';
import { StockMovement } from '../../inventory/entities/stock-movement.entity.js';
import { MovementType } from '../../common/enums/movement-type.enum.js';

export interface RecipeItemInput {
  essenceVariantId: string;
  gramsPerUnit: number;
}

// Servicio compartido para la receta de esencias de un producto final y su
// consumo de inventario. Lo usan Products (definir receta), Production e
// Inventory (consumir esencia al crear stock del producto final).
@Injectable()
export class RecipeService {
  constructor(
    @InjectRepository(ProductEssence)
    private readonly essenceRepo: Repository<ProductEssence>,
  ) {}

  // Receta actual de un producto (con la variante de esencia y su producto).
  async getRecipe(
    productId: string,
    tenantId: string,
  ): Promise<ProductEssence[]> {
    return this.essenceRepo.find({
      where: { productId, tenantId },
      relations: ['essenceVariant', 'essenceVariant.product'],
    });
  }

  // Reemplaza por completo la receta de un producto. Valida que cada variante
  // de esencia exista en el tenant. Se ejecuta dentro de la transacción del
  // create/update del producto (recibe el EntityManager).
  async replaceRecipe(
    manager: EntityManager,
    productId: string,
    tenantId: string,
    items: RecipeItemInput[],
  ): Promise<void> {
    const essenceRepo = manager.getRepository(ProductEssence);
    const variantRepo = manager.getRepository(ProductVariant);

    await essenceRepo.delete({ productId, tenantId });
    if (!items || items.length === 0) return;

    // Deduplicar por variante (suma no; nos quedamos con la última definición).
    const byVariant = new Map<string, number>();
    for (const it of items) {
      if (it.gramsPerUnit == null || it.gramsPerUnit < 0) {
        throw new BadRequestException(
          'Los gramos de esencia no pueden ser negativos',
        );
      }
      byVariant.set(it.essenceVariantId, Number(it.gramsPerUnit));
    }

    for (const [essenceVariantId, gramsPerUnit] of byVariant) {
      const variant = await variantRepo.findOne({
        where: { id: essenceVariantId, tenantId },
      });
      if (!variant) {
        throw new BadRequestException(
          `Esencia ${essenceVariantId} no encontrada`,
        );
      }
      await essenceRepo.save(
        essenceRepo.create({
          productId,
          essenceVariantId,
          gramsPerUnit,
          tenantId,
        }),
      );
    }
  }

  // Consume la esencia de la receta de `productId` para `units` unidades de
  // producto final, descontando de la bodega indicada y registrando los
  // movimientos OUT. Bloquea si el stock de esencia es insuficiente (no se
  // puede fabricar sin materia prima). No hace nada si el producto no tiene
  // receta (p.ej. productos que no son de perfumería). Devuelve el total de
  // gramos consumidos por variante (para trazabilidad).
  async consumeEssences(
    manager: EntityManager,
    params: {
      productId: string;
      units: number;
      warehouseId: string;
      userId: string | null;
      tenantId: string;
      referenceId?: string | null;
    },
  ): Promise<{ essenceVariantId: string; grams: number }[]> {
    const { productId, units, warehouseId, userId, tenantId } = params;
    if (units <= 0) return [];

    const essenceRepo = manager.getRepository(ProductEssence);
    const stockRepo = manager.getRepository(Stock);
    const movementRepo = manager.getRepository(StockMovement);
    const variantRepo = manager.getRepository(ProductVariant);

    const recipe = await essenceRepo.find({
      where: { productId, tenantId },
    });
    if (recipe.length === 0) return [];

    const consumed: { essenceVariantId: string; grams: number }[] = [];

    for (const item of recipe) {
      // Redondeo a gramo entero: el stock se maneja en gramos enteros.
      const grams = Math.round(Number(item.gramsPerUnit) * units);
      if (grams <= 0) continue;

      const stock = await stockRepo.findOne({
        where: { variantId: item.essenceVariantId, warehouseId, tenantId },
      });
      const available = stock ? Number(stock.quantity) : 0;
      if (available < grams) {
        const variant = await variantRepo.findOne({
          where: { id: item.essenceVariantId, tenantId },
        });
        throw new BadRequestException(
          `Esencia "${variant?.sku ?? item.essenceVariantId}": stock insuficiente ` +
            `(disponible ${available} g, requerido ${grams} g)`,
        );
      }

      stock!.quantity = available - grams;
      await stockRepo.save(stock!);

      await movementRepo.save(
        movementRepo.create({
          variantId: item.essenceVariantId,
          warehouseId,
          movementType: MovementType.OUT,
          quantity: grams,
          referenceType: 'PRODUCTION',
          referenceId: params.referenceId ?? undefined,
          notes: `Consumo de esencia por receta (${units} und)`,
          createdById: userId ?? undefined,
          tenantId,
        }),
      );

      consumed.push({ essenceVariantId: item.essenceVariantId, grams });
    }

    return consumed;
  }
}
