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
import { PurchaseOrderItem } from '../purchases/entities/purchase-order-item.entity.js';
import { SizeCurveItem } from '../catalogs/entities/size-curve-item.entity.js';
import { ProductVariant } from '../products/entities/product-variant.entity.js';
import { MovementType } from '../common/enums/movement-type.enum.js';
import { PurchaseOrderStatus } from '../common/enums/purchase-order-status.enum.js';
import { buildStockBarcode, withCheckDigit } from './barcode.util.js';
import { retryOnUniqueViolation } from '../common/utils/db-errors.util.js';
import { StockUnitContent } from './entities/stock-unit-content.entity.js';

@Injectable()
export class StockUnitsService {
  constructor(
    @InjectRepository(StockUnit)
    private readonly unitRepo: Repository<StockUnit>,
    @InjectRepository(SizeCurveItem)
    private readonly curveItemRepo: Repository<SizeCurveItem>,
    @InjectRepository(StockUnitContent)
    private readonly contentRepo: Repository<StockUnitContent>,
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
    return retryOnUniqueViolation(async () =>
      this.dataSource.transaction(async (m) => {
        // El renglón es la raíz del bloqueo: dos recepciones simultáneas no
        // pueden calcular el mismo pendiente ni emitir los mismos códigos.
        const line = await m
          .getRepository(PurchaseBoxLine)
          .createQueryBuilder('line')
          .setLock('pessimistic_write')
          .where('line.id = :boxLineId', { boxLineId })
          .andWhere('line.tenantId = :tenantId', { tenantId })
          .getOne();
        if (!line)
          throw new NotFoundException('Renglón de compra no encontrado');
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
        const order = await m.getRepository(PurchaseOrder).findOne({
          where: { id: line.purchaseOrderId, tenantId },
        });
        if (!order)
          throw new NotFoundException('Orden de compra no encontrada');
        const warehouseId = dto.warehouseId ?? order.warehouseId;
        if (!warehouseId) {
          throw new BadRequestException('Falta indicar la bodega de destino.');
        }
        const orderSeq = this.orderSequence(order.orderNumber);
        const cost = dto.landedUnitCost ?? Number(line.unitCost);
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

        const curveItems = line.sizeCurveId
          ? await m.getRepository(SizeCurveItem).find({
              where: { curveId: line.sizeCurveId, tenantId },
            })
          : [];
        const contentVariants = curveItems.length
          ? await m.getRepository(ProductVariant).find({
              where: {
                productId: line.productId,
                tenantId,
                isActive: true,
                sizeId: In(curveItems.map((item) => item.sizeId)),
                ...(line.colorId ? { colorId: line.colorId } : {}),
              },
            })
          : [];
        const contentVariantBySize = new Map(
          contentVariants
            .filter((candidate) => candidate.sizeId)
            .map((candidate) => [candidate.sizeId!, candidate]),
        );

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

        if (curveItems.length > 0) {
          await m.getRepository(StockUnitContent).save(
            saved.flatMap((box) =>
              curveItems.map((item) =>
                m.getRepository(StockUnitContent).create({
                  boxUnitId: box.id,
                  sizeId: item.sizeId,
                  variantId: contentVariantBySize.get(item.sizeId)?.id ?? null,
                  expectedQuantity: item.quantity,
                  actualQuantity: item.quantity,
                  tenantId,
                }),
              ),
            ),
          );
        }

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

        const boxLines = await m.getRepository(PurchaseBoxLine).find({
          where: { purchaseOrderId: order.id, tenantId, isActive: true },
        });
        const classicItems = await m.getRepository(PurchaseOrderItem).find({
          where: { purchaseOrderId: order.id, tenantId },
        });
        const receivedByLine = new Map(
          boxLines.map((candidate) => [
            candidate.id,
            candidate.id === line.id
              ? line.boxesReceived + toReceive
              : candidate.boxesReceived,
          ]),
        );
        const hasLines = boxLines.length > 0 || classicItems.length > 0;
        const allReceived =
          hasLines &&
          boxLines.every(
            (candidate) =>
              (receivedByLine.get(candidate.id) ?? 0) >= candidate.boxes,
          ) &&
          classicItems.every(
            (item) => item.quantityReceived >= item.quantityOrdered,
          );
        const someReceived =
          boxLines.some(
            (candidate) => (receivedByLine.get(candidate.id) ?? 0) > 0,
          ) || classicItems.some((item) => item.quantityReceived > 0);
        if (allReceived) order.status = PurchaseOrderStatus.RECEIVED;
        else if (someReceived) order.status = PurchaseOrderStatus.PARTIAL;
        await m.getRepository(PurchaseOrder).save(order);

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

        // Las cajas nuevas conservan un snapshot propio. Las recibidas antes de
        // esta capacidad mantienen compatibilidad leyendo la curva del renglón.
        const boxContents = await m.getRepository(StockUnitContent).find({
          where: { boxUnitId: box.id, tenantId },
        });
        const line = box.purchaseBoxLineId
          ? await m.getRepository(PurchaseBoxLine).findOne({
              where: { id: box.purchaseBoxLineId, tenantId },
            })
          : null;
        const fallbackCurveItems =
          boxContents.length === 0 && line?.sizeCurveId
            ? await m.getRepository(SizeCurveItem).find({
                where: { curveId: line.sizeCurveId, tenantId },
              })
            : [];
        const distribution =
          boxContents.length > 0
            ? boxContents
                .filter((item) => item.actualQuantity > 0)
                .map((item) => ({
                  sizeId: item.sizeId,
                  quantity: item.actualQuantity,
                }))
            : fallbackCurveItems.map((item) => ({
                sizeId: item.sizeId,
                quantity: item.quantity,
              }));
        if (distribution.length === 0) {
          throw new BadRequestException(
            'La caja no tiene un contenido detallado. Registra sus tallas antes de abrirla.',
          );
        }
        const curveQuantity = distribution.reduce(
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
            sizeId: In(distribution.map((item) => item.sizeId)),
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
        const missingSize = distribution.find(
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

        for (const item of distribution) {
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
        for (const item of distribution) {
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

  async getBoxContents(boxId: string, tenantId: string) {
    const box = await this.unitRepo.findOne({
      where: { id: boxId, tenantId },
    });
    if (!box) throw new NotFoundException('Caja no encontrada');
    if (box.kind !== StockUnitKind.BOX) {
      throw new BadRequestException('El código no corresponde a una caja.');
    }

    const [contents, variants] = await Promise.all([
      this.contentRepo.find({
        where: { boxUnitId: box.id, tenantId },
      }),
      this.dataSource.getRepository(ProductVariant).find({
        where: {
          productId: box.productId,
          tenantId,
          isActive: true,
          ...(box.colorId ? { colorId: box.colorId } : {}),
        },
        order: { createdAt: 'ASC' },
      }),
    ]);

    const availableSizes = variants
      .filter((variant) => variant.sizeId && variant.sizeRef)
      .map((variant) => ({
        sizeId: variant.sizeId!,
        name: variant.sizeRef!.name,
        sortOrder: variant.sizeRef!.sortOrder,
      }))
      .filter(
        (item, index, rows) =>
          rows.findIndex((candidate) => candidate.sizeId === item.sizeId) ===
          index,
      )
      .sort(
        (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
      );

    const orderBySize = new Map(
      availableSizes.map((size, index) => [size.sizeId, index]),
    );
    contents.sort(
      (a, b) =>
        (orderBySize.get(a.sizeId) ?? Number.MAX_SAFE_INTEGER) -
        (orderBySize.get(b.sizeId) ?? Number.MAX_SAFE_INTEGER),
    );

    return {
      box: {
        id: box.id,
        barcode: box.barcode,
        quantity: box.quantity,
        status: box.status,
      },
      items: contents,
      availableSizes,
    };
  }

  /**
   * Registra lo que realmente llegó dentro de una caja. La lista recibida es
   * completa: una talla omitida queda en cero, sin borrar el esperado.
   */
  async updateBoxContents(
    boxId: string,
    items: { sizeId: string; quantity: number }[],
    userId: string,
    tenantId: string,
  ) {
    const sizeIds = items.map((item) => item.sizeId);
    if (new Set(sizeIds).size !== sizeIds.length) {
      throw new BadRequestException('Cada talla solo puede aparecer una vez.');
    }
    const newQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
    if (newQuantity <= 0) {
      throw new BadRequestException(
        'Una caja debe contener al menos una unidad.',
      );
    }

    await this.dataSource.transaction(async (m) => {
      const unitRepo = m.getRepository(StockUnit);
      const box = await unitRepo.findOne({
        where: { id: boxId, tenantId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!box) throw new NotFoundException('Caja no encontrada');
      if (box.kind !== StockUnitKind.BOX) {
        throw new BadRequestException('Solo se puede detallar una caja.');
      }
      if (box.status !== StockUnitStatus.IN_STOCK) {
        throw new BadRequestException(
          'Solo se puede corregir una caja que esté en inventario.',
        );
      }
      if (!box.variantId) {
        throw new BadRequestException(
          'La caja no tiene variante de inventario.',
        );
      }

      const variants = await m.getRepository(ProductVariant).find({
        where: {
          productId: box.productId,
          tenantId,
          isActive: true,
          sizeId: In(sizeIds),
          ...(box.colorId ? { colorId: box.colorId } : {}),
        },
        order: { createdAt: 'ASC' },
      });
      const variantBySize = new Map<string, ProductVariant>();
      for (const variant of variants) {
        if (variant.sizeId && !variantBySize.has(variant.sizeId)) {
          variantBySize.set(variant.sizeId, variant);
        }
      }
      const missing = items.find((item) => !variantBySize.has(item.sizeId));
      if (missing) {
        throw new BadRequestException(
          'Una talla seleccionada no tiene variante activa para el producto y color de la caja.',
        );
      }

      const contentRepo = m.getRepository(StockUnitContent);
      const existing = await contentRepo.find({
        where: { boxUnitId: box.id, tenantId },
      });
      const requestedBySize = new Map(
        items.map((item) => [item.sizeId, item.quantity]),
      );
      const existingBySize = new Map(
        existing.map((content) => [content.sizeId, content]),
      );

      for (const content of existing) {
        content.actualQuantity = requestedBySize.get(content.sizeId) ?? 0;
        content.variantId =
          variantBySize.get(content.sizeId)?.id ?? content.variantId;
      }
      for (const item of items) {
        if (existingBySize.has(item.sizeId)) continue;
        existing.push(
          contentRepo.create({
            boxUnitId: box.id,
            sizeId: item.sizeId,
            variantId: variantBySize.get(item.sizeId)!.id,
            expectedQuantity: 0,
            actualQuantity: item.quantity,
            tenantId,
          }),
        );
      }
      await contentRepo.save(existing);

      const stockRepo = m.getRepository(Stock);
      const stock = await stockRepo.findOne({
        where: {
          variantId: box.variantId,
          warehouseId: box.warehouseId,
          tenantId,
        },
        lock: { mode: 'pessimistic_write' },
      });
      if (!stock) {
        throw new BadRequestException(
          'No existe el stock agregado de esta caja; corrígelo antes de detallarla.',
        );
      }
      const delta = newQuantity - box.quantity;
      const adjustedStock = Number(stock.quantity) + delta;
      if (adjustedStock < 0) {
        throw new BadRequestException(
          'El stock agregado no alcanza para registrar esta diferencia.',
        );
      }
      stock.quantity = adjustedStock;
      await stockRepo.save(stock);

      if (delta !== 0) {
        await m.getRepository(StockMovement).save(
          m.getRepository(StockMovement).create({
            variantId: box.variantId,
            warehouseId: box.warehouseId,
            tenantId,
            movementType: MovementType.ADJUSTMENT,
            quantity: adjustedStock,
            referenceType: 'StockUnit',
            referenceId: box.id,
            createdById: userId,
            notes: `Detalle físico de caja ${box.barcode}: ${box.quantity} -> ${newQuantity} (${delta > 0 ? '+' : ''}${delta})`,
          }),
        );
      }
      box.quantity = newQuantity;
      await unitRepo.save(box);
    });

    return this.getBoxContents(boxId, tenantId);
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
      relations: { size: true, contents: true },
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
