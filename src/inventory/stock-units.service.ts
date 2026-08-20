import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Brackets,
  DataSource,
  EntityManager,
  In,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
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
import {
  BARCODE_LIMITS,
  buildStockBarcode,
  withCheckDigit,
} from './barcode.util.js';
import { retryOnUniqueViolation } from '../common/utils/db-errors.util.js';
import { StockUnitContent } from './entities/stock-unit-content.entity.js';
import {
  StockUnitEvent,
  StockUnitEventType,
} from './entities/stock-unit-event.entity.js';
import { SaleItem } from '../pos/entities/sale-item.entity.js';
import { Product } from '../products/entities/product.entity.js';
import { Warehouse } from './entities/warehouse.entity.js';
import { Stand } from './entities/stand.entity.js';
import { StoreSettings } from '../storefront/entities/store-settings.entity.js';
import { Shelf } from './entities/shelf.entity.js';
import { sortSizes } from './box-description.js';
import {
  IntakeBoxesDto,
  TransferUnitsDto,
} from './dto/stock-unit.dto.js';

/** Identificadores que llegan por query string: se validan antes de consultar. */
/**
 * Tramo de «orden de compra» reservado para lo que entra sin compra. Ninguna
 * orden real lo usa: el consecutivo de una orden empieza en 1.
 */
const INTAKE_ORDER_SEQUENCE = 0;

/** Origen de los movimientos y eventos del ingreso directo. */
const INTAKE_REFERENCE = 'STOCK_UNIT_INTAKE';

/** Origen de los movimientos y eventos del traslado de bultos. */
const TRANSFER_REFERENCE = 'STOCK_UNIT_TRANSFER';

/** Por qué un código no se puede mover, en palabras de la bodega. */
const DESCRIPCION_DE_ESTADO: Record<StockUnitStatus, string> = {
  [StockUnitStatus.IN_STOCK]: 'está disponible',
  [StockUnitStatus.SOLD]: 'ya se vendió',
  [StockUnitStatus.CONSIGNED]: 'está en la calle, en consignación',
  [StockUnitStatus.TRANSFERRED]: 'va en camino a otra bodega',
  [StockUnitStatus.WRITTEN_OFF]: 'fue dado de baja',
  [StockUnitStatus.SPLIT]: 'es una caja que ya se abrió: traslada sus pares',
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class StockUnitsService {
  constructor(
    @InjectRepository(StockUnit)
    private readonly unitRepo: Repository<StockUnit>,
    @InjectRepository(SizeCurveItem)
    private readonly curveItemRepo: Repository<SizeCurveItem>,
    @InjectRepository(StockUnitContent)
    private readonly contentRepo: Repository<StockUnitContent>,
    @InjectRepository(StockUnitEvent)
    private readonly eventRepo: Repository<StockUnitEvent>,
    @InjectRepository(SaleItem)
    private readonly saleItemRepo: Repository<SaleItem>,
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
        // para convivir con el stock agregado (ver `equivalentVariant`).
        const variant = await this.equivalentVariant(
          m,
          line.productId,
          line.colorId,
          tenantId,
        );

        const curveItems = line.sizeCurveId
          ? await m.getRepository(SizeCurveItem).find({
              where: { curveId: line.sizeCurveId, tenantId },
            })
          : [];
        const contentVariantBySize = await this.variantsBySize(
          m,
          {
            productId: line.productId,
            colorId: line.colorId,
            sizeIds: curveItems.map((item) => item.sizeId),
          },
          tenantId,
        );

        const barcodePrefix = buildStockBarcode({
          date: today,
          orderSequence: orderSeq,
          lineConsecutive: line.consecutive,
          unitSequence: 0,
        }).slice(0, 13);
        let barcodeSequence = await this.nextUnitSequence(
          line.id,
          barcodePrefix,
          tenantId,
          m,
        );

        for (let i = 0; i < toReceive; i++) {
          const boxSequence = line.boxesReceived + i + 1;
          const body = buildStockBarcode({
            date: today,
            orderSequence: orderSeq,
            lineConsecutive: line.consecutive,
            unitSequence: barcodeSequence,
          });
          barcodeSequence++;
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
              boxSequence,
              pairSequence: null,
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

        await m.getRepository(StockUnitEvent).save(
          saved.map((box) =>
            m.getRepository(StockUnitEvent).create({
              stockUnitId: box.id,
              eventType: StockUnitEventType.RECEIVED,
              fromStatus: null,
              toStatus: StockUnitStatus.IN_STOCK,
              referenceType: 'PURCHASE_BOX_LINE',
              referenceId: line.id,
              userId,
              metadata: {
                barcode: box.barcode,
                quantity: box.quantity,
                warehouseId,
              },
              tenantId,
            }),
          ),
        );

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
   * Ingresa cajas que **ya están en la bodega**, sin orden de compra.
   *
   * Hasta ahora una caja solo podía nacer de un renglón de compra, y eso deja
   * fuera el caso más común al arrancar: la mercancía ya está ahí, el
   * proveedor ya cobró y no hay compra que registrar. Había que inventarse una
   * orden ficticia para poder etiquetar lo que uno ya tiene.
   *
   * Las cajas que entran por aquí son iguales a las de una compra —mismo
   * código de 16 dígitos, mismas etiquetas, mismo contenido por curva—. Lo
   * único que cambia es que no cuelgan de un proveedor, y por eso el código
   * lleva `0000` donde iría el consecutivo de la orden.
   */
  async intakeBoxes(
    dto: IntakeBoxesDto,
    userId: string,
    tenantId: string,
  ): Promise<StockUnit[]> {
    return retryOnUniqueViolation(async () =>
      this.dataSource.transaction(async (m) => {
        const settings = await m
          .getRepository(StoreSettings)
          .findOne({ where: { tenantId } });
        if (!settings?.unitTrackingEnabled) {
          throw new BadRequestException(
            'El inventario por cajas está apagado en esta tienda. Actívalo en Configuración antes de ingresar cajas.',
          );
        }

        const product = await m
          .getRepository(Product)
          .findOne({ where: { id: dto.productId, tenantId } });
        if (!product) throw new NotFoundException('Producto no encontrado');

        const warehouse = await m
          .getRepository(Warehouse)
          .findOne({ where: { id: dto.warehouseId, tenantId } });
        if (!warehouse) throw new NotFoundException('Bodega no encontrada');

        if (dto.standId) {
          const stand = await m
            .getRepository(Stand)
            .findOne({ where: { id: dto.standId, tenantId } });
          if (!stand) throw new NotFoundException('Estante no encontrado');
        }

        const curveItems = dto.sizeCurveId
          ? await m
              .getRepository(SizeCurveItem)
              .find({ where: { curveId: dto.sizeCurveId, tenantId } })
          : [];
        if (dto.sizeCurveId && curveItems.length === 0) {
          throw new BadRequestException(
            'La curva elegida no tiene tallas cargadas.',
          );
        }

        // Con curva manda el surtido: es lo que la caja trae de verdad. Sin
        // curva hay que decir cuántas unidades vienen, porque si no el
        // inventario que suma esta caja sería una adivinanza.
        const unitsPerBox = curveItems.length
          ? curveItems.reduce((total, item) => total + item.quantity, 0)
          : (dto.unitsPerBox ?? 0);
        if (unitsPerBox <= 0) {
          throw new BadRequestException(
            'Indica cuántas unidades trae cada caja, o elige una curva de tallas.',
          );
        }

        const variant = await this.equivalentVariant(
          m,
          dto.productId,
          dto.colorId ?? null,
          tenantId,
        );
        const contentVariantBySize = await this.variantsBySize(
          m,
          {
            productId: dto.productId,
            colorId: dto.colorId ?? null,
            sizeIds: curveItems.map((item) => item.sizeId),
          },
          tenantId,
        );

        const today = new Date();
        const lineConsecutive = await this.nextIntakeConsecutive(
          today,
          tenantId,
          m,
        );
        const barcodePrefix = buildStockBarcode({
          date: today,
          orderSequence: INTAKE_ORDER_SEQUENCE,
          lineConsecutive,
          unitSequence: 0,
        }).slice(0, 13);
        let barcodeSequence = await this.nextUnitSequence(
          null,
          barcodePrefix,
          tenantId,
          m,
        );
        if (barcodeSequence + dto.boxes - 1 > BARCODE_LIMITS.unit) {
          throw new BadRequestException(
            `Un ingreso admite hasta ${BARCODE_LIMITS.unit} cajas. Divídelo en varios.`,
          );
        }

        const unitRepo = m.getRepository(StockUnit);
        const units: StockUnit[] = [];
        for (let i = 0; i < dto.boxes; i++) {
          const body = buildStockBarcode({
            date: today,
            orderSequence: INTAKE_ORDER_SEQUENCE,
            lineConsecutive,
            unitSequence: barcodeSequence,
          });
          barcodeSequence++;
          units.push(
            unitRepo.create({
              barcode: withCheckDigit(body),
              kind: StockUnitKind.BOX,
              status: StockUnitStatus.IN_STOCK,
              productId: dto.productId,
              variantId: variant.id,
              colorId: dto.colorId ?? null,
              sizeId: null,
              warehouseId: dto.warehouseId,
              standId: dto.standId ?? null,
              quantity: unitsPerBox,
              cost: dto.unitCost ?? 0,
              purchaseBoxLineId: null,
              boxSequence: i + 1,
              pairSequence: null,
              tenantId,
            }),
          );
        }
        const saved = await unitRepo.save(units);

        if (curveItems.length > 0) {
          const contentRepo = m.getRepository(StockUnitContent);
          await contentRepo.save(
            saved.flatMap((box) =>
              curveItems.map((item) =>
                contentRepo.create({
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

        const eventRepo = m.getRepository(StockUnitEvent);
        await eventRepo.save(
          saved.map((box) =>
            eventRepo.create({
              stockUnitId: box.id,
              eventType: StockUnitEventType.RECEIVED,
              fromStatus: null,
              toStatus: StockUnitStatus.IN_STOCK,
              referenceType: INTAKE_REFERENCE,
              referenceId: null,
              userId,
              metadata: {
                barcode: box.barcode,
                quantity: box.quantity,
                warehouseId: dto.warehouseId,
                notes: dto.notes ?? null,
              },
              tenantId,
            }),
          ),
        );

        const motivo = dto.notes?.trim();
        await this.applyStockDelta(
          m,
          {
            variantId: variant.id,
            warehouseId: dto.warehouseId,
            quantity: dto.boxes * unitsPerBox,
            userId,
            tenantId,
            notes: motivo
              ? `Ingreso directo de ${dto.boxes} caja(s) · ${motivo}`
              : `Ingreso directo de ${dto.boxes} caja(s)`,
            referenceType: INTAKE_REFERENCE,
          },
          MovementType.IN,
        );

        return saved;
      }),
    );
  }

  /**
   * Traslada cajas o pares a otra bodega, moviendo **el bulto y su
   * inventario juntos**.
   *
   * El traslado de siempre (`transferStock`) mueve el agregado por variante y
   * no toca el bulto: la caja seguía figurando en la bodega de origen, que
   * quedaba en cero con una caja encima, y al intentar abrirla saltaba «el
   * stock agregado de la caja no alcanza». Acá se mueven las dos cosas.
   *
   * El bulto **no pasa por `TRANSFERRED`**: ese estado significa «va en
   * camino» y lo usa la remisión con confirmación de recepción
   * (`InternalRequest`). Un traslado directo llega en el mismo acto, así que
   * la caja sigue disponible y solo cambia de bodega. Si se marcara en
   * tránsito, en el destino no se podría vender.
   */
  async transferUnits(
    dto: TransferUnitsDto,
    userId: string,
    tenantId: string,
  ): Promise<StockUnit[]> {
    return this.dataSource.transaction(async (m) => {
      const destino = await m
        .getRepository(Warehouse)
        .findOne({ where: { id: dto.toWarehouseId, tenantId } });
      if (!destino) throw new NotFoundException('Bodega destino no encontrada');

      if (dto.toStandId) {
        // El estante tiene que ser de la bodega a la que llega: si no, la
        // etiqueta diría que está en un pasillo de la otra sede.
        const stand = await m
          .getRepository(Stand)
          .createQueryBuilder('stand')
          .innerJoin(Shelf, 'shelf', 'shelf.id = stand.shelfId')
          .where('stand.id = :standId', { standId: dto.toStandId })
          .andWhere('stand.tenantId = :tenantId', { tenantId })
          .andWhere('shelf.warehouse_id = :warehouseId', {
            warehouseId: dto.toWarehouseId,
          })
          .getOne();
        if (!stand) {
          throw new BadRequestException(
            'El estante elegido no pertenece a la bodega destino.',
          );
        }
      }

      const unitRepo = m.getRepository(StockUnit);
      const units = await unitRepo
        .createQueryBuilder('unit')
        .setLock('pessimistic_write')
        .where('unit.id IN (:...ids)', { ids: dto.ids })
        .andWhere('unit.tenantId = :tenantId', { tenantId })
        .getMany();
      if (units.length !== dto.ids.length) {
        throw new NotFoundException(
          'Alguno de los códigos no existe en esta tienda.',
        );
      }

      const stockRepo = m.getRepository(Stock);
      const movementRepo = m.getRepository(StockMovement);
      const eventRepo = m.getRepository(StockUnitEvent);
      const motivo = dto.notes?.trim();

      for (const unit of units) {
        if (unit.status !== StockUnitStatus.IN_STOCK) {
          throw new BadRequestException(
            `El código ${unit.barcode} no está disponible para trasladar: ${DESCRIPCION_DE_ESTADO[unit.status]}.`,
          );
        }
        if (unit.warehouseId === dto.toWarehouseId) {
          throw new BadRequestException(
            `El código ${unit.barcode} ya está en esa bodega.`,
          );
        }
        if (!unit.variantId) {
          throw new BadRequestException(
            `El código ${unit.barcode} no tiene variante asociada y no se puede mover su inventario.`,
          );
        }

        const origenId = unit.warehouseId;
        const cantidad = Number(unit.quantity);

        const origen = await stockRepo
          .createQueryBuilder('stock')
          .setLock('pessimistic_write')
          .where('stock.variantId = :variantId', { variantId: unit.variantId })
          .andWhere('stock.warehouseId = :warehouseId', {
            warehouseId: origenId,
          })
          .andWhere('stock.tenantId = :tenantId', { tenantId })
          .getOne();
        if (!origen || Number(origen.quantity) < cantidad) {
          throw new BadRequestException(
            `El inventario de la bodega de origen no alcanza para mover ${unit.barcode} (${cantidad} unidades). Cuadra el inventario antes de trasladar.`,
          );
        }
        let llegada = await stockRepo.findOne({
          where: {
            variantId: unit.variantId,
            warehouseId: dto.toWarehouseId,
            tenantId,
          },
        });
        if (!llegada) {
          llegada = stockRepo.create({
            variantId: unit.variantId,
            warehouseId: dto.toWarehouseId,
            quantity: 0,
            tenantId,
          });
        }
        origen.quantity = Number(origen.quantity) - cantidad;
        llegada.quantity = Number(llegada.quantity) + cantidad;
        await stockRepo.save(origen);
        await stockRepo.save(llegada);

        // Dos filas, como cualquier traslado: el signo dice de qué bodega
        // salió y a cuál entró.
        const nota = motivo
          ? `Traslado de ${unit.barcode} · ${motivo}`
          : `Traslado de ${unit.barcode}`;
        await movementRepo.save([
          movementRepo.create({
            variantId: unit.variantId,
            warehouseId: origenId,
            movementType: MovementType.TRANSFER,
            quantity: -cantidad,
            referenceType: TRANSFER_REFERENCE,
            referenceId: unit.id,
            notes: nota,
            createdById: userId,
            tenantId,
          }),
          movementRepo.create({
            variantId: unit.variantId,
            warehouseId: dto.toWarehouseId,
            movementType: MovementType.TRANSFER,
            quantity: cantidad,
            referenceType: TRANSFER_REFERENCE,
            referenceId: unit.id,
            notes: nota,
            createdById: userId,
            tenantId,
          }),
        ]);

        // El estante viejo es de la otra bodega: se limpia salvo que digan a
        // cuál llega.
        unit.warehouseId = dto.toWarehouseId;
        unit.standId = dto.toStandId ?? null;
        await unitRepo.save(unit);

        await eventRepo.save(
          eventRepo.create({
            stockUnitId: unit.id,
            eventType: StockUnitEventType.TRANSFERRED,
            fromStatus: StockUnitStatus.IN_STOCK,
            toStatus: StockUnitStatus.IN_STOCK,
            referenceType: TRANSFER_REFERENCE,
            referenceId: unit.id,
            userId,
            metadata: {
              fromWarehouseId: origenId,
              toWarehouseId: dto.toWarehouseId,
              standId: dto.toStandId ?? null,
              quantity: cantidad,
              notes: motivo ?? null,
            },
            tenantId,
          }),
        );
      }

      return units;
    });
  }

  /**
   * Consecutivo del ingreso directo dentro del día.
   *
   * Los ingresos sin compra comparten el tramo de orden (`0000`), así que lo
   * que los separa es este número: sin él, dos ingresos del mismo día
   * chocarían de código desde la primera caja.
   */
  private async nextIntakeConsecutive(
    date: Date,
    tenantId: string,
    manager: EntityManager,
  ): Promise<number> {
    const dayPrefix = buildStockBarcode({
      date,
      orderSequence: INTAKE_ORDER_SEQUENCE,
      lineConsecutive: 0,
      unitSequence: 0,
    }).slice(0, 10);
    const rows = await manager
      .getRepository(StockUnit)
      .createQueryBuilder('unit')
      .select('unit.barcode', 'barcode')
      .where('unit.tenantId = :tenantId', { tenantId })
      .andWhere('unit.barcode LIKE :prefix', { prefix: `${dayPrefix}%` })
      .getRawMany<{ barcode: string }>();
    let max = 0;
    for (const row of rows) {
      const consecutive = Number(row.barcode.slice(10, 13));
      if (!Number.isNaN(consecutive) && consecutive > max) max = consecutive;
    }
    if (max + 1 > BARCODE_LIMITS.line) {
      throw new BadRequestException(
        `Hoy ya se hicieron ${BARCODE_LIMITS.line} ingresos de cajas. Continúa mañana o registra la mercancía como compra.`,
      );
    }
    return max + 1;
  }

  /**
   * La variante donde vive el inventario de una caja cerrada.
   *
   * Una caja trae varias tallas, pero el stock agregado necesita una: se usa
   * la primera activa del producto/color y al abrirla se reparte a las tallas
   * reales. Es la misma regla que sigue la recepción de una compra.
   */
  private async equivalentVariant(
    m: EntityManager,
    productId: string,
    colorId: string | null,
    tenantId: string,
  ): Promise<ProductVariant> {
    const variant = await m.getRepository(ProductVariant).findOne({
      where: {
        productId,
        ...(colorId ? { colorId } : {}),
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
    return variant;
  }

  /** Variantes del producto por talla, para poder detallar lo que trae la caja. */
  private async variantsBySize(
    m: EntityManager,
    params: { productId: string; colorId: string | null; sizeIds: string[] },
    tenantId: string,
  ): Promise<Map<string, ProductVariant>> {
    if (params.sizeIds.length === 0) return new Map();
    const variants = await m.getRepository(ProductVariant).find({
      where: {
        productId: params.productId,
        tenantId,
        isActive: true,
        sizeId: In(params.sizeIds),
        ...(params.colorId ? { colorId: params.colorId } : {}),
      },
    });
    return new Map(
      variants
        .filter((variant) => variant.sizeId)
        .map((variant) => [variant.sizeId!, variant]),
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
    userId: string,
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
          ? await m
              .getRepository(PurchaseBoxLine)
              .createQueryBuilder('line')
              .setLock('pessimistic_write')
              .where('line.id = :lineId', { lineId: box.purchaseBoxLineId })
              .andWhere('line.tenantId = :tenantId', { tenantId })
              .getOne()
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
            'Falta una variante activa para una de las tallas de la curva y el color de la caja. Créala antes de abrir la caja.',
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
          m,
        );
        let pairSequence = 1;

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
                boxSequence: box.boxSequence,
                pairSequence,
                tenantId,
              }),
            );
            pairSequence++;
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
        const eventRepo = m.getRepository(StockUnitEvent);
        await eventRepo.save([
          eventRepo.create({
            stockUnitId: box.id,
            eventType: StockUnitEventType.SPLIT,
            fromStatus: StockUnitStatus.IN_STOCK,
            toStatus: StockUnitStatus.SPLIT,
            referenceType: 'STOCK_UNIT',
            referenceId: box.id,
            userId,
            metadata: { children: saved.length },
            tenantId,
          }),
          ...saved.map((child) =>
            eventRepo.create({
              stockUnitId: child.id,
              eventType: StockUnitEventType.CREATED_FROM_BOX,
              fromStatus: null,
              toStatus: StockUnitStatus.IN_STOCK,
              referenceType: 'STOCK_UNIT',
              referenceId: box.id,
              userId,
              metadata: { parentBarcode: box.barcode, sizeId: child.sizeId },
              tenantId,
            }),
          ),
        ]);

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
    manager?: EntityManager,
  ): Promise<number> {
    const repository = manager
      ? manager.getRepository(StockUnit)
      : this.unitRepo;
    // Con renglón de compra el universo son sus bultos; sin él —un ingreso
    // directo— son los códigos que ya empiezan por el mismo prefijo del día.
    const rows = boxLineId
      ? await repository.find({
          where: { purchaseBoxLineId: boxLineId, tenantId },
          select: { barcode: true },
        })
      : await repository
          .createQueryBuilder('unit')
          .select('unit.barcode', 'barcode')
          .where('unit.tenantId = :tenantId', { tenantId })
          .andWhere('unit.barcode LIKE :prefix', { prefix: `${prefix}%` })
          .getRawMany<{ barcode: string }>();
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
      await m.getRepository(StockUnitEvent).save(
        m.getRepository(StockUnitEvent).create({
          stockUnitId: box.id,
          eventType: StockUnitEventType.CONTENT_UPDATED,
          fromStatus: box.status,
          toStatus: box.status,
          referenceType: 'STOCK_UNIT',
          referenceId: box.id,
          userId,
          metadata: {
            previousQuantity: box.quantity - delta,
            quantity: newQuantity,
            items: items.map((item) => ({
              sizeId: item.sizeId,
              quantity: item.quantity,
            })),
          },
          tenantId,
        }),
      );
    });

    return this.getBoxContents(boxId, tenantId);
  }

  async findByBarcode(barcode: string, tenantId: string): Promise<StockUnit> {
    const unit = await this.unitRepo.findOne({
      where: { barcode, tenantId },
      relations: { product: true, color: true, size: true, stand: true },
    });
    if (!unit) throw new NotFoundException('No existe ninguna caja ni par con ese código');
    return unit;
  }

  async traceByBarcode(barcode: string, tenantId: string) {
    const normalized = barcode.trim();
    const unit = await this.unitRepo.findOne({
      where: { barcode: normalized, tenantId },
      relations: {
        product: true,
        color: true,
        size: true,
        stand: true,
        warehouse: true,
        contents: true,
      },
    });
    if (!unit) {
      throw new NotFoundException(
        `No existe ningún código físico "${normalized}" en esta tienda.`,
      );
    }

    const parent = unit.parentUnitId
      ? await this.unitRepo.findOne({
          where: { id: unit.parentUnitId, tenantId },
          relations: { product: true },
        })
      : null;
    const children = await this.unitRepo.find({
      where: { parentUnitId: unit.id, tenantId },
      relations: { size: true },
      order: { barcode: 'ASC' },
    });
    const purchaseLine = unit.purchaseBoxLineId
      ? await this.dataSource.getRepository(PurchaseBoxLine).findOne({
          where: { id: unit.purchaseBoxLineId, tenantId },
          relations: { purchaseOrder: { supplier: true } },
        })
      : null;
    const saleItem = await this.saleItemRepo.findOne({
      where: { stockUnitId: unit.id, tenantId },
      relations: ['sale', 'sale.client', 'sale.user', 'sale.warehouse'],
    });
    const events = await this.eventRepo.find({
      where: { stockUnitId: unit.id, tenantId },
      relations: { user: true },
      order: { createdAt: 'ASC' },
    });

    return {
      unit,
      parent,
      children,
      purchase: purchaseLine
        ? {
            lineId: purchaseLine.id,
            consecutive: purchaseLine.consecutive,
            orderId: purchaseLine.purchaseOrderId,
            orderNumber: purchaseLine.purchaseOrder?.orderNumber,
            supplier: purchaseLine.purchaseOrder?.supplier?.name ?? null,
            unitCost: Number(purchaseLine.unitCost),
          }
        : null,
      sale: saleItem
        ? {
            itemId: saleItem.id,
            quantity: saleItem.quantity,
            unitPrice: Number(saleItem.unitPrice),
            lineTotal: Number(saleItem.lineTotal),
            id: saleItem.sale.id,
            saleNumber: saleItem.sale.saleNumber,
            invoiceNumber: saleItem.sale.invoiceNumber,
            status: saleItem.sale.status,
            client: saleItem.sale.client
              ? `${saleItem.sale.client.firstName} ${saleItem.sale.client.lastName}`.trim()
              : null,
            user: saleItem.sale.user
              ? `${saleItem.sale.user.firstName} ${saleItem.sale.user.lastName}`.trim()
              : null,
            warehouse: saleItem.sale.warehouse?.name ?? null,
            createdAt: saleItem.sale.createdAt,
          }
        : null,
      events: events.map((event) => ({
        id: event.id,
        eventType: event.eventType,
        fromStatus: event.fromStatus,
        toStatus: event.toStatus,
        referenceType: event.referenceType,
        referenceId: event.referenceId,
        metadata: event.metadata,
        createdAt: event.createdAt,
        user: event.user
          ? {
              id: event.user.id,
              firstName: event.user.firstName,
              lastName: event.user.lastName,
            }
          : null,
      })),
    };
  }

  /**
   * Busca códigos físicos: cajas cerradas, pares sueltos o los dos.
   *
   * El **resumen se calcula sin el filtro de tipo**, a propósito: el
   * conmutador «Cajas / Pares» tiene que poder decir cuántas hay de cada una
   * *antes* de que alguien lo toque. El resto de filtros sí lo respeta,
   * porque la pregunta real de la bodega es «cuántas cajas tengo **aquí**».
   */
  async search(params: {
    q?: string;
    kind?: string;
    productId?: string;
    status?: string;
    warehouseId?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
    tenantId: string;
  }) {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(params.limit) || 25));
    this.validateSearchFilters(params);
    const kind = params.kind?.trim().toUpperCase();

    const qb = this.buildSearchQuery(params)
      .leftJoinAndSelect('unit.color', 'color')
      .leftJoinAndSelect('unit.size', 'size')
      .leftJoinAndSelect('unit.warehouse', 'warehouse')
      .leftJoinAndSelect('unit.stand', 'stand');
    if (kind) qb.andWhere('unit.kind = :kind', { kind });

    const [units, total] = await qb
      .orderBy('unit.createdAt', 'DESC')
      .addOrderBy('unit.barcode', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const resumen = await this.summarizeSearch(params);

    const lineIds = [
      ...new Set(units.map((unit) => unit.purchaseBoxLineId).filter(Boolean)),
    ] as string[];
    const unitIds = units.map((unit) => unit.id);
    const lines: PurchaseBoxLine[] = lineIds.length
      ? await this.dataSource.getRepository(PurchaseBoxLine).find({
          where: { id: In(lineIds), tenantId: params.tenantId },
          relations: { purchaseOrder: true },
        })
      : [];
    const saleItems: SaleItem[] = unitIds.length
      ? await this.saleItemRepo.find({
          where: { stockUnitId: In(unitIds), tenantId: params.tenantId },
          relations: { sale: true },
          order: { createdAt: 'DESC' },
        })
      : [];
    // Cuántos pares nacieron de cada caja abierta: es lo que la bodega
    // pregunta al ver una caja en «Abierta» y no encontrarla en el estante.
    const openBoxIds = units
      .filter((unit) => unit.status === StockUnitStatus.SPLIT)
      .map((unit) => unit.id);
    const childCounts = openBoxIds.length
      ? await this.unitRepo
          .createQueryBuilder('child')
          .select('child.parentUnitId', 'parentId')
          .addSelect('COUNT(child.id)', 'total')
          .where('child.tenantId = :tenantId', { tenantId: params.tenantId })
          .andWhere('child.parentUnitId IN (:...openBoxIds)', { openBoxIds })
          .groupBy('child.parentUnitId')
          .getRawMany<{ parentId: string; total: string }>()
      : [];
    const childrenByBox = new Map(
      childCounts.map((row) => [row.parentId, Number(row.total)]),
    );
    // Qué trae cada caja. Sin esto, elegir una caja en el punto de venta —o
    // mirarla en el listado— obliga a abrir su detalle una por una para saber
    // qué tallas hay adentro.
    const boxIds = units
      .filter((unit) => unit.kind === StockUnitKind.BOX)
      .map((unit) => unit.id);
    const contentRows = boxIds.length
      ? await this.contentRepo.find({
          where: { boxUnitId: In(boxIds), tenantId: params.tenantId },
          relations: { size: true },
        })
      : [];
    const contentsByBox = new Map<string, { size: string; quantity: number }[]>();
    for (const row of contentRows) {
      if (Number(row.actualQuantity) <= 0) continue;
      const actual = contentsByBox.get(row.boxUnitId) ?? [];
      actual.push({
        size: row.size?.name ?? '',
        quantity: Number(row.actualQuantity),
      });
      contentsByBox.set(row.boxUnitId, actual);
    }
    const lineById = new Map(lines.map((line) => [line.id, line]));
    const saleByUnit = new Map<string, SaleItem>();
    for (const item of saleItems) {
      if (item.stockUnitId && !saleByUnit.has(item.stockUnitId)) {
        saleByUnit.set(item.stockUnitId, item);
      }
    }

    return {
      data: units.map((unit) => {
        const line = unit.purchaseBoxLineId
          ? lineById.get(unit.purchaseBoxLineId)
          : null;
        const saleItem = saleByUnit.get(unit.id);
        return {
          id: unit.id,
          barcode: unit.barcode,
          kind: unit.kind,
          status: unit.status,
          quantity: unit.quantity,
          cost: Number(unit.cost),
          createdAt: unit.createdAt,
          boxSequence: unit.boxSequence,
          pairSequence: unit.pairSequence,
          parentUnitId: unit.parentUnitId,
          childCount: childrenByBox.get(unit.id) ?? 0,
          contents: sortSizes(contentsByBox.get(unit.id) ?? []),
          product: {
            id: unit.product.id,
            name: unit.product.name,
            skuPrefix: unit.product.skuPrefix,
            imageUrl: unit.product.imageUrl ?? null,
          },
          color: unit.color
            ? { id: unit.color.id, name: unit.color.name }
            : null,
          size: unit.size ? { id: unit.size.id, name: unit.size.name } : null,
          warehouse: { id: unit.warehouse.id, name: unit.warehouse.name },
          stand: unit.stand
            ? { id: unit.stand.id, name: unit.stand.name }
            : null,
          orderNumber: line?.purchaseOrder?.orderNumber ?? null,
          saleNumber: saleItem?.sale?.saleNumber ?? null,
          invoiceNumber: saleItem?.sale?.invoiceNumber ?? null,
        };
      }),
      resumen,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /** Cuántas cajas y cuántos pares hay bajo el filtro, y cuánto valen. */
  private async summarizeSearch(params: {
    q?: string;
    productId?: string;
    status?: string;
    warehouseId?: string;
    from?: string;
    to?: string;
    tenantId: string;
  }) {
    const filas = await this.buildSearchQuery(params)
      .select('unit.kind', 'kind')
      .addSelect('COUNT(unit.id)', 'bultos')
      .addSelect('COALESCE(SUM(unit.quantity), 0)', 'unidades')
      .addSelect('COALESCE(SUM(unit.quantity * unit.cost), 0)', 'costo')
      .groupBy('unit.kind')
      .getRawMany<{
        kind: string;
        bultos: string;
        unidades: string;
        costo: string;
      }>();
    const porTipo = (kind: StockUnitKind) =>
      filas.find((fila) => fila.kind === kind);
    const cajas = porTipo(StockUnitKind.BOX);
    const pares = porTipo(StockUnitKind.UNIT);
    return {
      cajas: Number(cajas?.bultos ?? 0),
      pares: Number(pares?.bultos ?? 0),
      // Unidades reales: una caja arrastra su contenido, un par vale uno.
      unidades: filas.reduce((suma, fila) => suma + Number(fila.unidades), 0),
      costo: filas.reduce((suma, fila) => suma + Number(fila.costo), 0),
    };
  }

  private validateSearchFilters(params: {
    from?: string;
    to?: string;
    kind?: string;
    status?: string;
    warehouseId?: string;
    productId?: string;
  }) {
    for (const [label, value] of [
      ['desde', params.from],
      ['hasta', params.to],
    ] as const) {
      if (
        value &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
          Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime()))
      ) {
        throw new BadRequestException(`La fecha ${label} no es válida.`);
      }
    }
    if (params.from && params.to && params.from > params.to) {
      throw new BadRequestException(
        'La fecha desde no puede ser posterior a la fecha hasta.',
      );
    }
    const kind = params.kind?.trim().toUpperCase();
    if (
      kind &&
      !Object.values(StockUnitKind).includes(kind as StockUnitKind)
    ) {
      throw new BadRequestException(
        'Tipo inválido: solo cajas o pares.',
      );
    }
    if (
      params.status &&
      !Object.values(StockUnitStatus).includes(params.status as StockUnitStatus)
    ) {
      throw new BadRequestException('Estado de código físico inválido.');
    }
    for (const [label, value] of [
      ['Bodega', params.warehouseId],
      ['Producto', params.productId],
    ] as const) {
      if (value && !UUID_PATTERN.test(value)) {
        throw new BadRequestException(`${label} inválida.`);
      }
    }
  }

  /**
   * Filtros comunes del buscador, **sin el tipo de bulto**.
   *
   * La búsqueda por texto va con `EXISTS` y no con `JOIN`: unir contra las
   * ventas duplica la fila del bulto que se vendió y editó más de una vez, y
   * con eso el conteo y las sumas del resumen salían infladas.
   */
  private buildSearchQuery(params: {
    q?: string;
    productId?: string;
    status?: string;
    warehouseId?: string;
    from?: string;
    to?: string;
    tenantId: string;
  }): SelectQueryBuilder<StockUnit> {
    const qb = this.unitRepo
      .createQueryBuilder('unit')
      .leftJoinAndSelect('unit.product', 'product')
      .where('unit.tenantId = :tenantId', { tenantId: params.tenantId });

    const q = params.q?.trim();
    if (q) {
      qb.andWhere(
        new Brackets((where) => {
          where
            .where('unit.barcode ILIKE :q')
            .orWhere('product.name ILIKE :q')
            .orWhere('product.skuPrefix ILIKE :q')
            .orWhere(
              `EXISTS (SELECT 1 FROM purchase_box_lines pbl
                 JOIN purchase_orders po ON po.id = pbl.purchase_order_id
                WHERE pbl.id = unit.purchase_box_line_id
                  AND po.tenant_id = unit.tenant_id
                  AND po.order_number ILIKE :q)`,
            )
            .orWhere(
              `EXISTS (SELECT 1 FROM sale_items si
                 JOIN sales s ON s.id = si.sale_id
                WHERE si.stock_unit_id = unit.id
                  AND s.tenant_id = unit.tenant_id
                  AND (s.sale_number ILIKE :q OR s.invoice_number ILIKE :q))`,
            );
        }),
        { q: `%${q}%` },
      );
    }
    if (params.status) {
      qb.andWhere('unit.status = :status', { status: params.status });
    }
    if (params.warehouseId) {
      qb.andWhere('unit.warehouseId = :warehouseId', {
        warehouseId: params.warehouseId,
      });
    }
    if (params.productId) {
      qb.andWhere('unit.productId = :productId', {
        productId: params.productId,
      });
    }
    if (params.from) {
      qb.andWhere('unit.createdAt >= :from', {
        from: new Date(`${params.from}T00:00:00.000Z`),
      });
    }
    if (params.to) {
      const exclusiveTo = new Date(`${params.to}T00:00:00.000Z`);
      exclusiveTo.setUTCDate(exclusiveTo.getUTCDate() + 1);
      qb.andWhere('unit.createdAt < :to', { to: exclusiveTo });
    }
    return qb;
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
    userId: string,
    tenantId: string,
  ): Promise<{ count: number }> {
    if (ids.length === 0) return { count: 0 };
    return this.dataSource.transaction(async (manager) => {
      const units = await manager.getRepository(StockUnit).find({
        where: { id: In(ids), tenantId },
      });
      const printedAt = new Date();
      await manager
        .getRepository(StockUnit)
        .createQueryBuilder()
        .update(StockUnit)
        .set({ printedAt })
        .whereInIds(units.map((unit) => unit.id))
        .andWhere('tenant_id = :tenantId', { tenantId })
        .execute();
      if (units.length > 0) {
        const eventRepo = manager.getRepository(StockUnitEvent);
        await eventRepo.save(
          units.map((unit) =>
            eventRepo.create({
              stockUnitId: unit.id,
              eventType: StockUnitEventType.PRINTED,
              fromStatus: unit.status,
              toStatus: unit.status,
              referenceType: 'STOCK_UNIT',
              referenceId: unit.id,
              userId,
              metadata: {},
              tenantId,
            }),
          ),
        );
      }
      return { count: units.length };
    });
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
      referenceType?: string;
      referenceId?: string;
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
        referenceType: params.referenceType,
        referenceId: params.referenceId,
        tenantId: params.tenantId,
      }),
    );
  }
}
