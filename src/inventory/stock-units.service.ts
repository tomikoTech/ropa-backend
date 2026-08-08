import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import {
  StockUnit,
  StockUnitKind,
  StockUnitStatus,
} from './entities/stock-unit.entity.js';
import { Stock } from './entities/stock.entity.js';
import { StockMovement } from './entities/stock-movement.entity.js';
import { PurchaseBoxLine } from '../purchases/entities/purchase-box-line.entity.js';
import { PurchaseOrder } from '../purchases/entities/purchase-order.entity.js';
import { SizeCurveItem } from '../catalogs/entities/size-curve-item.entity.js';
import { ProductVariant } from '../products/entities/product-variant.entity.js';
import { MovementType } from '../common/enums/movement-type.enum.js';
import { buildStockBarcode, withCheckDigit } from './barcode.util.js';
import { retryOnUniqueViolation } from '../common/utils/db-errors.util.js';

@Injectable()
export class StockUnitsService {
  constructor(
    @InjectRepository(StockUnit)
    private readonly unitRepo: Repository<StockUnit>,
    @InjectRepository(PurchaseBoxLine)
    private readonly boxLineRepo: Repository<PurchaseBoxLine>,
    @InjectRepository(SizeCurveItem)
    private readonly curveItemRepo: Repository<SizeCurveItem>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Consecutivo numérico de la orden, para el código de barras.
   * Se toma de los dígitos finales de `orderNumber` (OC-000029 -> 29).
   */
  private orderSequence(orderNumber: string): number {
    const digits = (orderNumber || '').replace(/\D/g, '');
    return digits ? Number(digits.slice(-4)) : 0;
  }

  /**
   * Recibe (detalla) un renglón de compra: convierte sus cajas en bultos
   * físicos con código de barras y suma el inventario.
   *
   * Es el equivalente a "detallar" del sistema anterior, con dos diferencias:
   * se puede recibir parcialmente, y queda registrado el movimiento de stock
   * para poder revertirlo.
   */
  async receiveBoxLine(
    boxLineId: string,
    dto: {
      boxes?: number;
      warehouseId?: string;
      standId?: string;
      landedUnitCost?: number;
    },
    userId: string,
    tenantId: string,
  ): Promise<StockUnit[]> {
    const line = await this.boxLineRepo.findOne({
      where: { id: boxLineId, tenantId },
      relations: { purchaseOrder: true },
    });
    if (!line) throw new NotFoundException('Renglón de compra no encontrado');
    if (!line.isActive) {
      throw new BadRequestException('El renglón está inactivo.');
    }

    const pending = line.boxes - line.boxesReceived;
    const toReceive = dto.boxes ?? pending;
    if (toReceive <= 0) {
      throw new BadRequestException('No hay cajas pendientes por recibir.');
    }
    if (toReceive > pending) {
      throw new BadRequestException(
        `Solo quedan ${pending} caja(s) por recibir en este renglón.`,
      );
    }

    const warehouseId =
      dto.warehouseId ?? line.purchaseOrder?.warehouseId ?? null;
    if (!warehouseId) {
      throw new BadRequestException('Falta indicar la bodega de destino.');
    }

    const order = line.purchaseOrder as PurchaseOrder | undefined;
    const orderSeq = this.orderSequence(order?.orderNumber ?? '');
    const cost = dto.landedUnitCost ?? Number(line.unitCost);

    return retryOnUniqueViolation(async () =>
      this.dataSource.transaction(async (m) => {
        const units: StockUnit[] = [];
        const today = new Date();
        // Una caja contiene varias tallas, pero la venta necesita una variante
        // para convivir con el stock agregado. Usa la primera variante activa
        // del mismo producto/color (el detalle real sigue en la caja/curva).
        const variant = await m.getRepository(ProductVariant).findOne({
          where: {
            productId: line.productId,
            ...(line.colorId ? { colorId: line.colorId } : {}),
            tenantId,
            isActive: true,
          },
          order: { createdAt: 'ASC' },
        });
        if (!variant) {
          throw new BadRequestException(
            'El producto no tiene una variante activa compatible con el color de la caja.',
          );
        }

        for (let i = 0; i < toReceive; i++) {
          const sequence = line.boxesReceived + i + 1;
          const body = buildStockBarcode({
            date: today,
            orderSequence: orderSeq,
            lineConsecutive: line.consecutive,
            unitSequence: sequence,
          });
          units.push(
            m.getRepository(StockUnit).create({
              barcode: withCheckDigit(body),
              kind: StockUnitKind.BOX,
              status: StockUnitStatus.IN_STOCK,
              productId: line.productId,
              variantId: variant.id,
              colorId: line.colorId,
              sizeId: null,
              warehouseId,
              standId: dto.standId ?? null,
              quantity: line.unitsPerBox,
              cost,
              purchaseBoxLineId: line.id,
              tenantId,
            }),
          );
        }

        const saved = await m.getRepository(StockUnit).save(units);

        // El renglón lleva su propio contador para poder recibir por partes.
        await m
          .getRepository(PurchaseBoxLine)
          .update(
            { id: line.id, tenantId },
            { boxesReceived: line.boxesReceived + toReceive },
          );

        await this.applyStockDelta(
          m,
          {
            variantId: variant.id,
            warehouseId,
            quantity: toReceive * line.unitsPerBox,
            userId,
            tenantId,
            notes: `Recepción de ${toReceive} caja(s) · renglón #${line.consecutive}`,
          },
          MovementType.IN,
        );

        return saved;
      }),
    );
  }

  /**
   * Abre una caja: la marca como abierta y crea una unidad por cada par de su
   * curva, cada una con su propio código.
   *
   * La caja **no se borra**: queda en `SPLIT` para que el código ya impreso
   * siga siendo rastreable si aparece pegado en algún lado.
   */
  async splitBox(
    unitId: string,
    tenantId: string,
  ): Promise<{ parent: StockUnit; units: StockUnit[] }> {
    return retryOnUniqueViolation(async () =>
      this.dataSource.transaction(async (m) => {
        const unitRepo = m.getRepository(StockUnit);
        const box = await unitRepo.findOne({
          where: { id: unitId, tenantId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!box) throw new NotFoundException('Bulto no encontrado');
        if (box.kind !== StockUnitKind.BOX) {
          throw new BadRequestException('Solo se pueden abrir cajas.');
        }
        if (box.status !== StockUnitStatus.IN_STOCK) {
          throw new BadRequestException(
            'Solo se puede abrir una caja que esté en inventario.',
          );
        }
        if (!box.variantId) {
          throw new BadRequestException(
            'La caja no tiene una variante asociada. Vuelve a recibirla o ejecuta la migración de F5.',
          );
        }

        // Las tallas salen de la curva del renglón de compra del que vino la caja.
        const line = box.purchaseBoxLineId
          ? await m.getRepository(PurchaseBoxLine).findOne({
              where: { id: box.purchaseBoxLineId, tenantId },
            })
          : null;
        const curveItems = line?.sizeCurveId
          ? await m.getRepository(SizeCurveItem).find({
              where: { curveId: line.sizeCurveId, tenantId },
            })
          : [];
        if (curveItems.length === 0) {
          throw new BadRequestException(
            'La caja no tiene curva de tallas asociada, así que no se sabe qué tallas contiene. ' +
              'Asigna una curva al renglón de compra antes de abrirla.',
          );
        }
        const curveQuantity = curveItems.reduce(
          (sum, item) => sum + item.quantity,
          0,
        );
        if (curveQuantity !== box.quantity) {
          throw new BadRequestException(
            `La curva reparte ${curveQuantity} unidades pero la caja contiene ${box.quantity}. Corrige el renglón antes de abrirla.`,
          );
        }

        const variantRepo = m.getRepository(ProductVariant);
        const boxVariant = await variantRepo.findOne({
          where: { id: box.variantId, tenantId },
        });
        const targetColorId = box.colorId ?? boxVariant?.colorId ?? null;
        const variants = await variantRepo.find({
          where: {
            productId: box.productId,
            tenantId,
            isActive: true,
            sizeId: In(curveItems.map((item) => item.sizeId)),
            ...(targetColorId ? { colorId: targetColorId } : {}),
          },
          order: { createdAt: 'ASC' },
        });
        const variantBySize = new Map<string, ProductVariant>();
        for (const variant of variants) {
          if (variant.sizeId && !variantBySize.has(variant.sizeId)) {
            variantBySize.set(variant.sizeId, variant);
          }
        }
        const missingSize = curveItems.find(
          (item) => !variantBySize.has(item.sizeId),
        );
        if (missingSize) {
          throw new BadRequestException(
            'Falta una variante activa para una de las tallas de la curva y el color de la caja. Créala antes de abrir el bulto.',
          );
        }

        const units: StockUnit[] = [];
        const base = box.barcode.slice(0, 16);

        // La secuencia de las unidades continúa DESPUÉS de la de todas las
        // cajas y unidades ya emitidas del renglón. Si empezara en 1, la
        // primera unidad tendría el mismo código que la primera caja.
        let sequence = await this.nextUnitSequence(
          box.purchaseBoxLineId,
          base.slice(0, 13),
          tenantId,
        );

        for (const item of curveItems) {
          const variant = variantBySize.get(item.sizeId)!;
          for (let i = 0; i < item.quantity; i++) {
            const body = base.slice(0, 13) + String(sequence).padStart(3, '0');
            sequence++;
            units.push(
              unitRepo.create({
                barcode: withCheckDigit(body),
                kind: StockUnitKind.UNIT,
                status: StockUnitStatus.IN_STOCK,
                productId: box.productId,
                variantId: variant.id,
                colorId: targetColorId,
                sizeId: item.sizeId,
                warehouseId: box.warehouseId,
                standId: box.standId,
                quantity: 1,
                cost: box.cost,
                purchaseBoxLineId: box.purchaseBoxLineId,
                parentUnitId: box.id,
                tenantId,
              }),
            );
          }
        }

        // La caja cerrada vive en el agregado de una variante equivalente. Al
        // abrirla, redistribuye esas mismas unidades entre sus tallas reales.
        const targetQuantities = new Map<string, number>();
        for (const item of curveItems) {
          const variantId = variantBySize.get(item.sizeId)!.id;
          targetQuantities.set(
            variantId,
            (targetQuantities.get(variantId) ?? 0) + item.quantity,
          );
        }
        const stockRepo = m.getRepository(Stock);
        const affectedVariantIds = [
          ...new Set([box.variantId, ...targetQuantities.keys()]),
        ];
        const stocks = await stockRepo.find({
          where: {
            variantId: In(affectedVariantIds),
            warehouseId: box.warehouseId,
            tenantId,
          },
          lock: { mode: 'pessimistic_write' },
        });
        const stockByVariant = new Map(
          stocks.map((stock) => [stock.variantId, stock]),
        );
        const sourceStock = stockByVariant.get(box.variantId);
        if (!sourceStock || Number(sourceStock.quantity) < box.quantity) {
          throw new BadRequestException(
            'El stock agregado de la caja no alcanza para abrirla. Corrige el inventario antes de continuar.',
          );
        }
        const deltas = new Map<string, number>([
          [box.variantId, -box.quantity],
        ]);
        for (const [variantId, quantity] of targetQuantities) {
          deltas.set(variantId, (deltas.get(variantId) ?? 0) + quantity);
        }
        for (const [variantId, delta] of deltas) {
          let stock = stockByVariant.get(variantId);
          if (!stock) {
            stock = stockRepo.create({
              variantId,
              warehouseId: box.warehouseId,
              quantity: 0,
              tenantId,
            });
          }
          stock.quantity = Number(stock.quantity) + delta;
          await stockRepo.save(stock);
        }

        const saved = await unitRepo.save(units);
        await unitRepo.update(
          { id: box.id, tenantId },
          { status: StockUnitStatus.SPLIT },
        );

        // El total agregado no cambia; solo deja de estar concentrado en la
        // variante equivalente de la caja y pasa a las tallas de la curva.
        return {
          parent: { ...box, status: StockUnitStatus.SPLIT },
          units: saved,
        };
      }),
    );
  }

  /**
   * Siguiente número de bulto libre dentro del renglón.
   *
   * Cajas y unidades comparten el mismo espacio de secuencias (los tres
   * últimos dígitos del código), así que se continúa desde el mayor emitido.
   * Usar el conteo daría colisiones en cuanto se abre una caja.
   */
  private async nextUnitSequence(
    boxLineId: string | null,
    prefix: string,
    tenantId: string,
  ): Promise<number> {
    if (!boxLineId) return 1;
    const rows = await this.unitRepo.find({
      where: { purchaseBoxLineId: boxLineId, tenantId },
      select: { barcode: true },
    });
    let max = 0;
    for (const r of rows) {
      if (!r.barcode.startsWith(prefix)) continue;
      const seq = Number(r.barcode.slice(13, 16));
      if (!Number.isNaN(seq) && seq > max) max = seq;
    }
    return max + 1;
  }

  async findByBarcode(barcode: string, tenantId: string): Promise<StockUnit> {
    const unit = await this.unitRepo.findOne({
      where: { barcode, tenantId },
      relations: { product: true, color: true, size: true, stand: true },
    });
    if (!unit) throw new NotFoundException('No existe un bulto con ese código');
    return unit;
  }

  async findByBoxLine(
    boxLineId: string,
    tenantId: string,
  ): Promise<StockUnit[]> {
    return this.unitRepo.find({
      where: { purchaseBoxLineId: boxLineId, tenantId },
      relations: { size: true },
      order: { barcode: 'ASC' },
    });
  }

  async markPrinted(
    ids: string[],
    tenantId: string,
  ): Promise<{ count: number }> {
    if (ids.length === 0) return { count: 0 };
    const result = await this.unitRepo
      .createQueryBuilder()
      .update(StockUnit)
      .set({ printedAt: new Date() })
      .whereInIds(ids)
      .andWhere('tenant_id = :tenantId', { tenantId })
      .execute();
    return { count: result.affected ?? 0 };
  }

  /**
   * Mantiene sincronizado el agregado `Stock` y deja el movimiento registrado.
   * El POS, los reportes y el e-commerce siguen leyendo de ahí.
   */
  private async applyStockDelta(
    m: EntityManager,
    params: {
      variantId: string;
      warehouseId: string;
      quantity: number;
      userId: string;
      tenantId: string;
      notes: string;
    },
    type: MovementType,
  ): Promise<void> {
    const variant = await m.getRepository(ProductVariant).findOne({
      where: { id: params.variantId, tenantId: params.tenantId },
    });
    if (!variant) return;

    const stockRepo = m.getRepository(Stock);
    let stock = await stockRepo.findOne({
      where: {
        variantId: variant.id,
        warehouseId: params.warehouseId,
        tenantId: params.tenantId,
      },
    });
    if (!stock) {
      stock = stockRepo.create({
        variantId: variant.id,
        warehouseId: params.warehouseId,
        quantity: 0,
        tenantId: params.tenantId,
      });
    }
    const delta = type === MovementType.IN ? params.quantity : -params.quantity;
    stock.quantity += delta;
    await stockRepo.save(stock);

    await m.getRepository(StockMovement).save(
      m.getRepository(StockMovement).create({
        variantId: variant.id,
        warehouseId: params.warehouseId,
        movementType: type,
        quantity: params.quantity,
        createdById: params.userId,
        notes: params.notes,
        tenantId: params.tenantId,
      }),
    );
  }
}
