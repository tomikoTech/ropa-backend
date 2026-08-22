import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import {
  InventoryCount,
  InventoryCountStatus,
} from './entities/inventory-count.entity.js';
import { InventoryCountLine } from './entities/inventory-count-line.entity.js';
import { InventoryCountExpectedUnit } from './entities/inventory-count-expected-unit.entity.js';
import {
  InventoryCountScan,
  InventoryCountScanResult,
} from './entities/inventory-count-scan.entity.js';
import { Stock } from './entities/stock.entity.js';
import { StockMovement } from './entities/stock-movement.entity.js';
import { StockUnit, StockUnitStatus } from './entities/stock-unit.entity.js';
import {
  StockUnitEvent,
  StockUnitEventType,
} from './entities/stock-unit-event.entity.js';
import { ProductVariant } from '../products/entities/product-variant.entity.js';
import { MovementType } from '../common/enums/movement-type.enum.js';

export interface CountDifference {
  variantId: string;
  sku: string;
  productName: string;
  size: string;
  color: string;
  expected: number;
  counted: number;
  difference: number;
}

export interface ScanInput {
  barcode: string;
  clientScanId: string;
  deviceId?: string;
}

const SUCCESS_RESULTS = [
  InventoryCountScanResult.COUNTED,
  InventoryCountScanResult.SURPLUS,
];

@Injectable()
export class InventoryCountsService {
  constructor(
    @InjectRepository(InventoryCount)
    private readonly countRepo: Repository<InventoryCount>,
    @InjectRepository(InventoryCountLine)
    private readonly lineRepo: Repository<InventoryCountLine>,
    @InjectRepository(InventoryCountExpectedUnit)
    private readonly expectedUnitRepo: Repository<InventoryCountExpectedUnit>,
    @InjectRepository(InventoryCountScan)
    private readonly scanRepo: Repository<InventoryCountScan>,
    @InjectRepository(Stock)
    private readonly stockRepo: Repository<Stock>,
    @InjectRepository(ProductVariant)
    private readonly variantRepo: Repository<ProductVariant>,
    private readonly dataSource: DataSource,
  ) {}

  private async nextNumber(
    manager: EntityManager,
    tenantId: string,
  ): Promise<string> {
    const row = await manager
      .getRepository(InventoryCount)
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
    return this.dataSource.transaction(async (manager) => {
      // Serializa apertura y consecutivo sin bloquear otros tenants/bodegas.
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `inventory-count:${tenantId}:${warehouseId}`,
      ]);
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `inventory-count-number:${tenantId}`,
      ]);

      const countRepo = manager.getRepository(InventoryCount);
      const openOne = await countRepo.findOne({
        where: { warehouseId, tenantId, status: InventoryCountStatus.OPEN },
      });
      if (openOne) {
        throw new BadRequestException(
          `Ya hay un conteo abierto en esta bodega (${openOne.countNumber}). Ciérralo antes de abrir otro.`,
        );
      }

      const count = await countRepo.save(
        countRepo.create({
          countNumber: await this.nextNumber(manager, tenantId),
          warehouseId,
          startedAt: new Date(),
          notes: notes ?? null,
          createdById: userId,
          tenantId,
        }),
      );

      // La comparación siempre se hace contra esta foto, no contra un stock
      // que pudo cambiar mientras varios dispositivos estaban contando.
      const stocks = await manager.getRepository(Stock).find({
        where: { warehouseId, tenantId },
      });
      if (stocks.length > 0) {
        await manager.getRepository(InventoryCountLine).insert(
          stocks.map((stock) => ({
            countId: count.id,
            variantId: stock.variantId,
            expectedQuantity: stock.quantity,
            countedQuantity: 0,
            tenantId,
          })),
        );
      }

      const physicalUnits = await manager.getRepository(StockUnit).find({
        where: {
          warehouseId,
          tenantId,
          status: StockUnitStatus.IN_STOCK,
        },
      });
      if (physicalUnits.length > 0) {
        await manager.getRepository(InventoryCountExpectedUnit).insert(
          physicalUnits.map((unit) => ({
            countId: count.id,
            stockUnitId: unit.id,
            barcode: unit.barcode,
            quantity: unit.quantity,
            tenantId,
          })),
        );
      }

      return count;
    });
  }

  private async lockOpen(
    manager: EntityManager,
    id: string,
    tenantId: string,
  ): Promise<InventoryCount> {
    // `warehouse` es eager; pedir FOR UPDATE mediante TypeORM intentaría
    // bloquear también el lado nullable del LEFT JOIN y PostgreSQL lo rechaza.
    // Bloqueamos exclusivamente la fila madre y después la hidratamos.
    await manager.query(
      'SELECT id FROM inventory_counts WHERE id = $1 AND tenant_id = $2 FOR UPDATE',
      [id, tenantId],
    );
    const count = await manager.getRepository(InventoryCount).findOne({
      where: { id, tenantId },
    });
    if (!count) throw new NotFoundException('Conteo no encontrado');
    if (count.status !== InventoryCountStatus.OPEN) {
      throw new BadRequestException('Este conteo ya está cerrado.');
    }
    return count;
  }

  private async incrementLine(
    manager: EntityManager,
    countId: string,
    variantId: string,
    quantity: number,
    tenantId: string,
  ): Promise<InventoryCountLine> {
    const repo = manager.getRepository(InventoryCountLine);
    await manager.query(
      'SELECT id FROM inventory_count_lines WHERE count_id = $1 AND variant_id = $2 AND tenant_id = $3 FOR UPDATE',
      [countId, variantId, tenantId],
    );
    let line = await repo.findOne({
      where: { countId, variantId, tenantId },
    });
    if (!line) {
      line = repo.create({
        countId,
        variantId,
        expectedQuantity: 0,
        countedQuantity: 0,
        tenantId,
      });
    }
    line.countedQuantity += quantity;
    return repo.save(line);
  }

  /** Conteo manual compatible con productos que no tienen código individual. */
  async addCount(
    countId: string,
    variantId: string,
    quantity: number,
    tenantId: string,
  ): Promise<InventoryCountLine> {
    return this.dataSource.transaction(async (manager) => {
      await this.lockOpen(manager, countId, tenantId);
      const variant = await manager.getRepository(ProductVariant).findOne({
        where: { id: variantId, tenantId },
      });
      if (!variant) throw new NotFoundException('Variante no encontrada');
      return this.incrementLine(
        manager,
        countId,
        variantId,
        quantity,
        tenantId,
      );
    });
  }

  /**
   * Escanea un código físico de caja o unidad. El bloqueo de la sesión hace
   * que dos pistolas nunca puedan contar el mismo código simultáneamente.
   */
  async scan(
    countId: string,
    input: ScanInput,
    userId: string,
    tenantId: string,
  ): Promise<InventoryCountScan> {
    return this.dataSource.transaction(async (manager) => {
      const count = await this.lockOpen(manager, countId, tenantId);
      const scanRepo = manager.getRepository(InventoryCountScan);
      const clientScanId = input.clientScanId.trim();
      const barcode = input.barcode.trim();

      const retried = await scanRepo.findOne({
        where: { countId, clientScanId, tenantId },
        relations: { stockUnit: { product: true, warehouse: true } },
      });
      if (retried) return retried;

      const unit = await manager.getRepository(StockUnit).findOne({
        where: { barcode, tenantId },
        relations: {
          product: true,
          warehouse: true,
          variant: true,
          contents: { variant: true, size: true },
        },
      });

      let result: InventoryCountScanResult;
      let quantity = 0;
      let message: string;

      if (!unit) {
        result = InventoryCountScanResult.UNKNOWN;
        message = 'Código no registrado en esta tienda';
      } else {
        const prior = await scanRepo.findOne({
          where: {
            countId,
            stockUnitId: unit.id,
            tenantId,
            result: In(SUCCESS_RESULTS),
          },
        });
        if (prior) {
          result = InventoryCountScanResult.DUPLICATE;
          message = `Ya fue contado en ${count.countNumber}`;
        } else if (unit.status !== StockUnitStatus.IN_STOCK) {
          result = InventoryCountScanResult.NOT_AVAILABLE;
          message = `Código con estado ${unit.status}; no se sumó`;
        } else if (unit.warehouseId !== count.warehouseId) {
          result = InventoryCountScanResult.WRONG_WAREHOUSE;
          message = `Pertenece a ${unit.warehouse?.name ?? 'otra bodega'}; no se sumó`;
        } else {
          const expected = await manager
            .getRepository(InventoryCountExpectedUnit)
            .findOne({
              where: { countId, stockUnitId: unit.id, tenantId },
            });
          result = expected
            ? InventoryCountScanResult.COUNTED
            : InventoryCountScanResult.SURPLUS;

          const components = this.componentsForUnit(unit);
          for (const component of components) {
            await this.incrementLine(
              manager,
              countId,
              component.variantId,
              component.quantity,
              tenantId,
            );
            quantity += component.quantity;
          }
          message = expected
            ? `${unit.product?.name ?? 'Producto'}: ${quantity} unidad(es) contadas`
            : `Sobrante físico: no estaba al abrir el conteo; se sumaron ${quantity}`;
        }
      }

      return scanRepo.save(
        scanRepo.create({
          countId,
          clientScanId,
          deviceId: input.deviceId?.trim() || null,
          barcode,
          stockUnitId: unit?.id ?? null,
          stockUnit: unit ?? null,
          result,
          quantity,
          message,
          scannedById: userId,
          tenantId,
        }),
      );
    });
  }

  /**
   * Contra qué variante cuenta un bulto escaneado.
   *
   * Siempre la suya, **también las cajas cerradas**. Parece contraintuitivo
   * —una caja trae varias tallas— pero es dónde vive su stock: al recibirla se
   * suma entero a una «variante equivalente», porque el inventario agregado
   * necesita una variante y la caja todavía no se ha abierto.
   *
   * Antes se devolvía el desglose por talla, y el conteo terminaba hundiendo la
   * existencia de la variante equivalente e inflando la de las demás tallas,
   * con la caja aún disponible. Era el peor de los descuadres porque se
   * disparaba justo en la operación que existe para cuadrar: contar el
   * inventario lo dejaba peor que antes.
   *
   * Las tallas de adentro se vuelven stock real cuando la caja se abre, no
   * cuando se cuenta.
   */
  private componentsForUnit(
    unit: StockUnit,
  ): Array<{ variantId: string; quantity: number }> {
    if (!unit.variantId) {
      throw new BadRequestException(
        `El código ${unit.barcode} no tiene variante asociada y requiere conciliación.`,
      );
    }
    return [{ variantId: unit.variantId, quantity: unit.quantity }];
  }

  async getDifferences(
    countId: string,
    tenantId: string,
  ): Promise<CountDifference[]> {
    const count = await this.countRepo.findOne({
      where: { id: countId, tenantId },
    });
    if (!count) throw new NotFoundException('Conteo no encontrado');

    const lines = await this.lineRepo.find({ where: { countId, tenantId } });
    if (lines.length === 0) return [];
    const variants = await this.variantRepo.find({
      where: { id: In(lines.map((line) => line.variantId)), tenantId },
      relations: { product: true },
    });
    const byVariant = new Map(lines.map((line) => [line.variantId, line]));
    return variants
      .map((variant) => {
        const line = byVariant.get(variant.id)!;
        return {
          variantId: variant.id,
          sku: variant.sku,
          productName: variant.product?.name ?? '',
          size: variant.sizeName,
          color: variant.colorName,
          expected: line.expectedQuantity,
          counted: line.countedQuantity,
          difference: line.countedQuantity - line.expectedQuantity,
        };
      })
      .filter((difference) => difference.difference !== 0)
      .sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference));
  }

  async getPhysicalDifferences(countId: string, tenantId: string) {
    const count = await this.countRepo.findOne({
      where: { id: countId, tenantId },
    });
    if (!count) throw new NotFoundException('Conteo no encontrado');
    const [expected, scans] = await Promise.all([
      this.expectedUnitRepo.find({
        where: { countId, tenantId },
        relations: {
          stockUnit: {
            product: true,
            warehouse: true,
            size: true,
            color: true,
          },
        },
        order: { barcode: 'ASC' },
      }),
      this.scanRepo.find({
        where: { countId, tenantId },
        relations: {
          stockUnit: {
            product: true,
            warehouse: true,
            size: true,
            color: true,
          },
        },
        order: { createdAt: 'DESC' },
      }),
    ]);
    const countedIds = new Set(
      scans
        .filter((scan) => SUCCESS_RESULTS.includes(scan.result))
        .map((scan) => scan.stockUnitId),
    );
    const expectedIds = new Set(expected.map((row) => row.stockUnitId));
    return {
      missing: expected.filter((row) => !countedIds.has(row.stockUnitId)),
      surplus: scans.filter(
        (scan) =>
          SUCCESS_RESULTS.includes(scan.result) &&
          scan.stockUnitId &&
          !expectedIds.has(scan.stockUnitId),
      ),
      exceptions: scans.filter(
        (scan) => !SUCCESS_RESULTS.includes(scan.result),
      ),
    };
  }

  async getSession(countId: string, tenantId: string) {
    const count = await this.countRepo.findOne({
      where: { id: countId, tenantId },
    });
    if (!count) throw new NotFoundException('Conteo no encontrado');
    const [lines, expected, scans, physical] = await Promise.all([
      this.lineRepo.find({ where: { countId, tenantId } }),
      this.expectedUnitRepo.find({ where: { countId, tenantId } }),
      this.scanRepo.find({
        where: { countId, tenantId },
        relations: {
          stockUnit: {
            product: true,
            warehouse: true,
            size: true,
            color: true,
          },
        },
        order: { createdAt: 'DESC' },
        take: 100,
      }),
      this.getPhysicalDifferences(countId, tenantId),
    ]);
    return {
      count,
      summary: {
        expectedQuantity: lines.reduce(
          (sum, line) => sum + line.expectedQuantity,
          0,
        ),
        countedQuantity: lines.reduce(
          (sum, line) => sum + line.countedQuantity,
          0,
        ),
        expectedCodes: expected.length,
        // No usar `recentScans`: está limitado a 100 para la pantalla.
        countedCodes:
          expected.length - physical.missing.length + physical.surplus.length,
        missingCodes: physical.missing.length,
        surplusCodes: physical.surplus.length,
        exceptions: physical.exceptions.length,
        // Referencias con existencia en el sistema que nadie ha contado: si se
        // cierra ajustando, quedan en cero. La pantalla lo advierte antes.
        zeroedReferences: lines.filter(
          (line) => line.expectedQuantity > 0 && line.countedQuantity === 0,
        ).length,
      },
      recentScans: scans,
    };
  }

  async close(
    countId: string,
    adjust: boolean,
    confirmation: string,
    acknowledgeExceptions: boolean,
    userId: string,
    tenantId: string,
  ): Promise<{
    count: InventoryCount;
    adjusted: number;
    writtenOffCodes: number;
    zeroedReferences: number;
  }> {
    return this.dataSource.transaction(async (manager) => {
      const count = await this.lockOpen(manager, countId, tenantId);
      if (confirmation.trim() !== count.countNumber) {
        throw new BadRequestException(
          `Escribe ${count.countNumber} para confirmar el cierre irreversible.`,
        );
      }
      const exceptionCount = await manager
        .getRepository(InventoryCountScan)
        .count({
          where: {
            countId,
            tenantId,
            result: In([
              InventoryCountScanResult.UNKNOWN,
              InventoryCountScanResult.WRONG_WAREHOUSE,
              InventoryCountScanResult.NOT_AVAILABLE,
            ]),
          },
        });
      if (exceptionCount > 0 && !acknowledgeExceptions) {
        throw new BadRequestException(
          `Hay ${exceptionCount} novedad(es). Revísalas y confirma que deseas cerrar.`,
        );
      }

      const lines = await manager.getRepository(InventoryCountLine).find({
        where: { countId, tenantId },
      });
      const differences = lines.filter(
        (line) => line.countedQuantity !== line.expectedQuantity,
      );
      // Referencias que existían en la bodega y nadie escaneó: ajustar las deja
      // en cero. Es lo correcto en un conteo completo y catastrófico en uno que
      // quedó a medias, así que se nombra antes de hacerlo.
      const zeroedReferences = lines.filter(
        (line) => line.expectedQuantity > 0 && line.countedQuantity === 0,
      ).length;
      if (adjust && zeroedReferences > 0 && !acknowledgeExceptions) {
        throw new BadRequestException(
          `${zeroedReferences} referencia(s) del sistema no se contaron y el ajuste las dejaría en 0. ` +
            `Si el conteo quedó a medias, ciérralo sin ajustar. Si de verdad no había nada de esas referencias, ` +
            `confirma para continuar.`,
        );
      }
      let writtenOffCodes = 0;

      if (adjust) {
        for (const line of differences) {
          const stockRepo = manager.getRepository(Stock);
          let stock = await stockRepo.findOne({
            where: {
              variantId: line.variantId,
              warehouseId: count.warehouseId,
              tenantId,
            },
            lock: { mode: 'pessimistic_write' },
          });
          if (!stock) {
            stock = stockRepo.create({
              variantId: line.variantId,
              warehouseId: count.warehouseId,
              quantity: 0,
              tenantId,
            });
          }
          // El movimiento se calcula contra la existencia **de este momento**,
          // no contra la foto de apertura: si hubo ventas mientras se contaba,
          // usar la foto dejaría el kardex descuadrado contra el stock real.
          const actual = Number(stock.quantity);
          const difference = line.countedQuantity - actual;
          if (difference === 0) continue;
          stock.quantity = line.countedQuantity;
          await stockRepo.save(stock);
          await manager.getRepository(StockMovement).save(
            manager.getRepository(StockMovement).create({
              variantId: line.variantId,
              warehouseId: count.warehouseId,
              movementType: difference > 0 ? MovementType.IN : MovementType.OUT,
              quantity: Math.abs(difference),
              createdById: userId,
              notes:
                `Ajuste por conteo ${count.countNumber}: sistema ${actual}, ` +
                `contado ${line.countedQuantity}` +
                (actual !== line.expectedQuantity
                  ? ` (al abrir el conteo había ${line.expectedQuantity})`
                  : ''),
              tenantId,
            }),
          );
        }

        const expectedUnits = await manager
          .getRepository(InventoryCountExpectedUnit)
          .find({
            where: { countId, tenantId },
            relations: { stockUnit: true },
          });
        const successfulScans = await manager
          .getRepository(InventoryCountScan)
          .find({
            where: { countId, tenantId, result: In(SUCCESS_RESULTS) },
          });

        // Dar de baja lo que no apareció solo tiene sentido si de verdad se
        // pasó el lector por la bodega. En un conteo hecho a mano no se escanea
        // nada, así que «no apareció» significa «no lo buscamos con el lector»
        // — y el barrido daba de baja TODOS los bultos etiquetados de esa
        // bodega. Contar una talla a mano borraba el rastro de todo lo demás.
        const huboEscaneo = successfulScans.length > 0;
        const foundIds = new Set(
          successfulScans.map((scan) => scan.stockUnitId),
        );
        for (const expected of huboEscaneo ? expectedUnits : []) {
          if (foundIds.has(expected.stockUnitId)) continue;
          const unit = await manager.getRepository(StockUnit).findOne({
            where: { id: expected.stockUnitId, tenantId },
            lock: { mode: 'pessimistic_write' },
          });
          if (
            !unit ||
            unit.status !== StockUnitStatus.IN_STOCK ||
            unit.warehouseId !== count.warehouseId
          )
            continue;
          unit.status = StockUnitStatus.WRITTEN_OFF;
          await manager.getRepository(StockUnit).save(unit);
          await manager.getRepository(StockUnitEvent).save(
            manager.getRepository(StockUnitEvent).create({
              stockUnitId: unit.id,
              eventType: StockUnitEventType.WRITTEN_OFF,
              fromStatus: StockUnitStatus.IN_STOCK,
              toStatus: StockUnitStatus.WRITTEN_OFF,
              referenceType: 'InventoryCount',
              referenceId: count.id,
              userId,
              metadata: {
                countNumber: count.countNumber,
                reason: 'MISSING_IN_PHYSICAL_COUNT',
              },
              tenantId,
            }),
          );
          writtenOffCodes += 1;
        }
      }

      count.status = InventoryCountStatus.CLOSED;
      count.closedAt = new Date();
      await manager.getRepository(InventoryCount).save(count);
      return {
        count,
        adjusted: adjust ? differences.length : 0,
        writtenOffCodes,
        zeroedReferences: adjust ? zeroedReferences : 0,
      };
    });
  }

  async exportCsv(countId: string, tenantId: string): Promise<string> {
    const count = await this.countRepo.findOne({
      where: { id: countId, tenantId },
    });
    if (!count) throw new NotFoundException('Conteo no encontrado');
    const physical = await this.getPhysicalDifferences(countId, tenantId);
    const quote = (value: string | number | null | undefined) =>
      `"${String(value ?? '').replaceAll('"', '""')}"`;
    const rows: string[][] = [
      [
        'conteo',
        'tipo',
        'codigo',
        'producto',
        'talla',
        'color',
        'bodega',
        'estado',
        'fecha',
      ],
    ];
    for (const row of physical.missing) {
      rows.push([
        count.countNumber,
        'FALTANTE',
        row.barcode,
        row.stockUnit?.product?.name ?? '',
        row.stockUnit?.size?.name ?? '',
        row.stockUnit?.color?.name ?? '',
        row.stockUnit?.warehouse?.name ?? '',
        row.stockUnit?.status ?? '',
        '',
      ]);
    }
    for (const scan of [...physical.surplus, ...physical.exceptions]) {
      rows.push([
        count.countNumber,
        scan.result === InventoryCountScanResult.SURPLUS
          ? 'SOBRANTE'
          : 'NOVEDAD',
        scan.barcode,
        scan.stockUnit?.product?.name ?? '',
        scan.stockUnit?.size?.name ?? '',
        scan.stockUnit?.color?.name ?? '',
        scan.stockUnit?.warehouse?.name ?? '',
        scan.message,
        scan.createdAt?.toISOString() ?? '',
      ]);
    }
    return `\uFEFF${rows.map((row) => row.map(quote).join(',')).join('\n')}`;
  }

  async findAll(tenantId: string): Promise<InventoryCount[]> {
    return this.countRepo.find({
      where: { tenantId },
      order: { startedAt: 'DESC' },
    });
  }
}
