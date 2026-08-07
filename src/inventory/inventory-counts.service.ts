import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import {
  InventoryCount,
  InventoryCountStatus,
} from './entities/inventory-count.entity.js';
import { InventoryCountLine } from './entities/inventory-count-line.entity.js';
import { Stock } from './entities/stock.entity.js';
import { StockMovement } from './entities/stock-movement.entity.js';
import { ProductVariant } from '../products/entities/product-variant.entity.js';
import { MovementType } from '../common/enums/movement-type.enum.js';
import { retryOnUniqueViolation } from '../common/utils/db-errors.util.js';

export interface CountDifference {
  variantId: string;
  sku: string;
  productName: string;
  size: string;
  color: string;
  /** Lo que dice el sistema. */
  expected: number;
  /** Lo que se contó físicamente. */
  counted: number;
  /** counted − expected: negativo es faltante, positivo es sobrante. */
  difference: number;
}

@Injectable()
export class InventoryCountsService {
  constructor(
    @InjectRepository(InventoryCount)
    private readonly countRepo: Repository<InventoryCount>,
    @InjectRepository(InventoryCountLine)
    private readonly lineRepo: Repository<InventoryCountLine>,
    @InjectRepository(Stock)
    private readonly stockRepo: Repository<Stock>,
    @InjectRepository(ProductVariant)
    private readonly variantRepo: Repository<ProductVariant>,
    private readonly dataSource: DataSource,
  ) {}

  private async nextNumber(tenantId: string): Promise<string> {
    const row = await this.countRepo
      .createQueryBuilder('c')
      .select(
        "MAX(CAST(substring(c.count_number FROM '^INV-0*([0-9]+)$') AS integer))",
        'max',
      )
      .where('c.tenantId = :tenantId', { tenantId })
      .getRawOne<{ max: string | null }>();
    return `INV-${String(Number(row?.max ?? 0) + 1).padStart(5, '0')}`;
  }

  async open(
    warehouseId: string,
    notes: string | undefined,
    userId: string,
    tenantId: string,
  ): Promise<InventoryCount> {
    // Dos conteos abiertos a la vez sobre la misma bodega darían resultados
    // contradictorios al cerrarlos.
    const openOne = await this.countRepo.findOne({
      where: { warehouseId, tenantId, status: InventoryCountStatus.OPEN },
    });
    if (openOne) {
      throw new BadRequestException(
        `Ya hay un conteo abierto en esta bodega (${openOne.countNumber}). Ciérralo antes de abrir otro.`,
      );
    }

    return retryOnUniqueViolation(async () =>
      this.countRepo.save(
        this.countRepo.create({
          countNumber: await this.nextNumber(tenantId),
          warehouseId,
          startedAt: new Date(),
          notes: notes ?? null,
          createdById: userId,
          tenantId,
        }),
      ),
    );
  }

  private async getOpen(id: string, tenantId: string): Promise<InventoryCount> {
    const count = await this.countRepo.findOne({ where: { id, tenantId } });
    if (!count) throw new NotFoundException('Conteo no encontrado');
    if (count.status !== InventoryCountStatus.OPEN) {
      throw new BadRequestException('Este conteo ya está cerrado.');
    }
    return count;
  }

  /**
   * Registra unidades contadas. Se **acumula**: así se puede contar pasando el
   * lector por la mercancía, que es como se hace en bodega.
   */
  async addCount(
    countId: string,
    variantId: string,
    quantity: number,
    tenantId: string,
  ): Promise<InventoryCountLine> {
    await this.getOpen(countId, tenantId);

    const variant = await this.variantRepo.findOne({
      where: { id: variantId, tenantId },
    });
    if (!variant) throw new NotFoundException('Variante no encontrada');

    return retryOnUniqueViolation(async () => {
      const existing = await this.lineRepo.findOne({
        where: { countId, variantId, tenantId },
      });
      if (existing) {
        existing.countedQuantity += quantity;
        return this.lineRepo.save(existing);
      }
      return this.lineRepo.save(
        this.lineRepo.create({
          countId,
          variantId,
          countedQuantity: quantity,
          tenantId,
        }),
      );
    });
  }

  /**
   * Diferencias entre lo contado y lo que dice el sistema.
   *
   * Incluye lo que tiene existencias pero **no se contó** (aparece como
   * faltante total): es justo lo que un conteo debe sacar a la luz.
   */
  async getDifferences(
    countId: string,
    tenantId: string,
  ): Promise<CountDifference[]> {
    const count = await this.countRepo.findOne({
      where: { id: countId, tenantId },
    });
    if (!count) throw new NotFoundException('Conteo no encontrado');

    const [lines, stocks] = await Promise.all([
      this.lineRepo.find({ where: { countId, tenantId } }),
      this.stockRepo.find({
        where: { warehouseId: count.warehouseId, tenantId },
      }),
    ]);

    const countedByVariant = new Map(
      lines.map((l) => [l.variantId, l.countedQuantity]),
    );
    const expectedByVariant = new Map(
      stocks.map((s) => [s.variantId, s.quantity]),
    );

    const variantIds = new Set([
      ...countedByVariant.keys(),
      ...expectedByVariant.keys(),
    ]);
    if (variantIds.size === 0) return [];

    const variants = await this.variantRepo.find({
      where: { id: In([...variantIds]) },
      relations: { product: true },
    });

    return variants
      .map((v) => {
        const expected = expectedByVariant.get(v.id) ?? 0;
        const counted = countedByVariant.get(v.id) ?? 0;
        return {
          variantId: v.id,
          sku: v.sku,
          productName: v.product?.name ?? '',
          size: v.sizeName,
          color: v.colorName,
          expected,
          counted,
          difference: counted - expected,
        };
      })
      .filter((d) => d.difference !== 0)
      .sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference));
  }

  /**
   * Cierra el conteo. Si `adjust` es true, deja el inventario igual a lo
   * contado y registra el movimiento de ajuste de cada diferencia, para que
   * quede claro qué se corrigió y por qué.
   */
  async close(
    countId: string,
    adjust: boolean,
    userId: string,
    tenantId: string,
  ): Promise<{ count: InventoryCount; adjusted: number }> {
    const count = await this.getOpen(countId, tenantId);
    const differences = await this.getDifferences(countId, tenantId);

    await this.dataSource.transaction(async (m) => {
      if (adjust) {
        for (const d of differences) {
          await m.getRepository(Stock).update(
            {
              variantId: d.variantId,
              warehouseId: count.warehouseId,
              tenantId,
            },
            { quantity: d.counted },
          );
          await m.getRepository(StockMovement).save(
            m.getRepository(StockMovement).create({
              variantId: d.variantId,
              warehouseId: count.warehouseId,
              movementType:
                d.difference > 0 ? MovementType.IN : MovementType.OUT,
              quantity: Math.abs(d.difference),
              createdById: userId,
              notes: `Ajuste por conteo ${count.countNumber}: sistema ${d.expected}, contado ${d.counted}`,
              tenantId,
            }),
          );
        }
      }
      await m
        .getRepository(InventoryCount)
        .update(
          { id: countId, tenantId },
          { status: InventoryCountStatus.CLOSED, closedAt: new Date() },
        );
    });

    return {
      count: { ...count, status: InventoryCountStatus.CLOSED },
      adjusted: adjust ? differences.length : 0,
    };
  }

  async findAll(tenantId: string): Promise<InventoryCount[]> {
    return this.countRepo.find({
      where: { tenantId },
      order: { startedAt: 'DESC' },
    });
  }
}
