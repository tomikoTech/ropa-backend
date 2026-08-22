import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, IsNull, Repository } from 'typeorm';
import {
  InternalRequest,
  InternalRequestStatus,
} from './entities/internal-request.entity.js';
import { InternalRequestItem } from './entities/internal-request-item.entity.js';
import { InternalRequestUnit } from './entities/internal-request-unit.entity.js';
import { InternalRequestShipment } from './entities/internal-request-shipment.entity.js';
import { ProductVariant } from '../products/entities/product-variant.entity.js';
import { Warehouse } from '../inventory/entities/warehouse.entity.js';
import { Stock } from '../inventory/entities/stock.entity.js';
import { StockTransfer } from '../inventory/entities/stock-transfer.entity.js';
import {
  StockUnit,
  StockUnitStatus,
} from '../inventory/entities/stock-unit.entity.js';
import { AccessService } from '../access/access.service.js';
import { StockLedgerService } from '../inventory/ledger/stock-ledger.service.js';

interface CreateInput {
  destinationWarehouseId: string;
  notes?: string;
  items: Array<{ variantId: string; quantity: number }>;
}
interface PrepareInput {
  sourceWarehouseId: string;
  items: Array<{ itemId: string; quantity: number; barcodes?: string[] }>;
}

@Injectable()
export class InternalRequestsService {
  constructor(
    @InjectRepository(InternalRequest)
    private readonly repo: Repository<InternalRequest>,
    private readonly dataSource: DataSource,
    private readonly access: AccessService,
    private readonly ledger: StockLedgerService,
  ) {}

  private async lock(manager: EntityManager, id: string, tenantId: string) {
    await manager.query(
      'SELECT id FROM internal_requests WHERE id = $1 AND tenant_id = $2 FOR UPDATE',
      [id, tenantId],
    );
    const request = await manager.getRepository(InternalRequest).findOne({
      where: { id, tenantId },
      relations: { items: { variant: { product: true } } },
    });
    if (!request) throw new NotFoundException('Solicitud no encontrada');
    return request;
  }

  async create(input: CreateInput, userId: string, tenantId: string) {
    const grouped = new Map<string, number>();
    for (const item of input.items) {
      grouped.set(
        item.variantId,
        (grouped.get(item.variantId) ?? 0) + item.quantity,
      );
    }
    return this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `internal-request-number:${tenantId}`,
      ]);
      const warehouse = await manager.getRepository(Warehouse).findOneBy({
        id: input.destinationWarehouseId,
        tenantId,
        isActive: true,
      });
      if (!warehouse)
        throw new NotFoundException('Bodega destino no encontrada');
      const variants = await manager.getRepository(ProductVariant).findBy({
        id: In([...grouped.keys()]),
        tenantId,
      });
      if (variants.length !== grouped.size)
        throw new BadRequestException('Hay variantes inválidas');
      const max = await manager
        .getRepository(InternalRequest)
        .createQueryBuilder('r')
        .select(
          "MAX(CAST(substring(r.request_number FROM '^SO-0*([0-9]+)$') AS integer))",
          'max',
        )
        .where('r.tenantId = :tenantId', { tenantId })
        .getRawOne<{ max: string | null }>();
      const requestRepo = manager.getRepository(InternalRequest);
      const request = await requestRepo.save(
        requestRepo.create({
          requestNumber: `SO-${String(Number(max?.max ?? 0) + 1).padStart(5, '0')}`,
          destinationWarehouseId: input.destinationWarehouseId,
          sourceWarehouseId: null,
          notes: input.notes?.trim() || null,
          createdById: userId,
          tenantId,
        }),
      );
      const itemRepo = manager.getRepository(InternalRequestItem);
      await itemRepo.save(
        [...grouped].map(([variantId, quantity]) =>
          itemRepo.create({
            requestId: request.id,
            variantId,
            requestedQuantity: quantity,
            preparedQuantity: 0,
            remittedQuantity: 0,
            tenantId,
          }),
        ),
      );
      return this.findOne(request.id, tenantId, manager);
    });
  }

  async prepare(
    id: string,
    input: PrepareInput,
    userId: string,
    tenantId: string,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const request = await this.lock(manager, id, tenantId);
      if (
        ![
          InternalRequestStatus.CREATED,
          InternalRequestStatus.PREPARED,
        ].includes(request.status)
      ) {
        throw new BadRequestException(
          `No se puede preparar una solicitud ${request.status}`,
        );
      }
      if (input.sourceWarehouseId === request.destinationWarehouseId) {
        throw new BadRequestException('Origen y destino deben ser diferentes');
      }
      const source = await manager.getRepository(Warehouse).findOneBy({
        id: input.sourceWarehouseId,
        tenantId,
        isActive: true,
      });
      if (!source) throw new NotFoundException('Bodega origen no encontrada');
      if (
        request.sourceWarehouseId &&
        request.sourceWarehouseId !== source.id
      ) {
        throw new BadRequestException(
          'La preparación ya empezó en otra bodega',
        );
      }
      request.sourceWarehouseId = source.id;
      const itemById = new Map(request.items.map((item) => [item.id, item]));
      for (const row of input.items) {
        const item = itemById.get(row.itemId);
        if (!item)
          throw new BadRequestException(
            'El ítem no pertenece a esta solicitud',
          );
        if (item.preparedQuantity + row.quantity > item.requestedQuantity) {
          throw new BadRequestException(
            `La preparación supera lo pedido para ${item.variant.sku}`,
          );
        }
        await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
          `internal-request-reserve:${tenantId}:${source.id}:${item.variantId}`,
        ]);
        const stock = await manager.getRepository(Stock).findOneBy({
          variantId: item.variantId,
          warehouseId: source.id,
          tenantId,
        });
        const reserved = await manager
          .getRepository(InternalRequestItem)
          .createQueryBuilder('i')
          .innerJoin(InternalRequest, 'r', 'r.id = i.request_id')
          .select(
            'COALESCE(SUM(i.prepared_quantity - i.remitted_quantity), 0)',
            'qty',
          )
          .where(
            'r.tenant_id = :tenantId AND r.source_warehouse_id = :source',
            { tenantId, source: source.id },
          )
          .andWhere('i.variant_id = :variantId AND i.id <> :itemId', {
            variantId: item.variantId,
            itemId: item.id,
          })
          .andWhere('r.status IN (:...statuses)', {
            statuses: [
              InternalRequestStatus.CREATED,
              InternalRequestStatus.PREPARED,
            ],
          })
          .getRawOne<{ qty: string }>();
        const available =
          Number(stock?.quantity ?? 0) - Number(reserved?.qty ?? 0);
        if (available < item.preparedQuantity + row.quantity) {
          throw new BadRequestException(
            `Stock insuficiente para ${item.variant.sku}. Disponible sin reservar: ${Math.max(0, available - item.preparedQuantity)}`,
          );
        }
        const barcodes = [
          ...new Set(
            (row.barcodes ?? []).map((value) => value.trim()).filter(Boolean),
          ),
        ];
        if (barcodes.length) {
          const units = await manager.getRepository(StockUnit).find({
            where: { barcode: In(barcodes), tenantId },
          });
          if (units.length !== barcodes.length)
            throw new BadRequestException('Hay códigos físicos no encontrados');
          const physicalQuantity = units.reduce(
            (sum, unit) => sum + unit.quantity,
            0,
          );
          if (physicalQuantity !== row.quantity) {
            throw new BadRequestException(
              `Los códigos suman ${physicalQuantity}, pero se prepararon ${row.quantity}`,
            );
          }
          for (const unit of units) {
            if (
              unit.variantId !== item.variantId ||
              unit.warehouseId !== source.id ||
              unit.status !== StockUnitStatus.IN_STOCK
            ) {
              throw new BadRequestException(
                `El código ${unit.barcode} no está disponible para este ítem y bodega`,
              );
            }
            const used = await manager
              .getRepository(InternalRequestUnit)
              .createQueryBuilder('u')
              .innerJoin(InternalRequestItem, 'i', 'i.id = u.request_item_id')
              .innerJoin(InternalRequest, 'r', 'r.id = i.request_id')
              .where('u.stock_unit_id = :unitId', { unitId: unit.id })
              .andWhere('r.status IN (:...statuses)', {
                statuses: [
                  InternalRequestStatus.CREATED,
                  InternalRequestStatus.PREPARED,
                ],
              })
              .getExists();
            if (used)
              throw new BadRequestException(
                `El código ${unit.barcode} ya está preparado en otra solicitud`,
              );
            await manager.getRepository(InternalRequestUnit).save(
              manager.getRepository(InternalRequestUnit).create({
                requestItemId: item.id,
                stockUnitId: unit.id,
                tenantId,
              }),
            );
          }
        }
        item.preparedQuantity += row.quantity;
        await manager.getRepository(InternalRequestItem).save(item);
      }
      request.status = InternalRequestStatus.PREPARED;
      request.preparedById = userId;
      request.preparedAt = new Date();
      await manager.getRepository(InternalRequest).save(request);
      return this.findOne(id, tenantId, manager);
    });
  }

  async remit(
    id: string,
    rows: Array<{ itemId: string; quantity: number }>,
    userId: string,
    tenantId: string,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const request = await this.lock(manager, id, tenantId);
      if (
        request.status !== InternalRequestStatus.PREPARED ||
        !request.sourceWarehouseId
      ) {
        throw new BadRequestException('La solicitud debe estar preparada');
      }
      const byId = new Map(request.items.map((item) => [item.id, item]));
      for (const row of rows) {
        const item = byId.get(row.itemId);
        if (
          !item ||
          row.quantity > item.preparedQuantity - item.remittedQuantity
        ) {
          throw new BadRequestException('Cantidad a remitir inválida');
        }
        const stockRepo = manager.getRepository(Stock);
        const stock = await stockRepo.findOne({
          where: {
            variantId: item.variantId,
            warehouseId: request.sourceWarehouseId,
            tenantId,
          },
          lock: { mode: 'pessimistic_write' },
        });
        if (!stock || stock.quantity < row.quantity)
          throw new BadRequestException(
            `Stock insuficiente para ${item.variant.sku}`,
          );
        const preparedUnits = await manager
          .getRepository(InternalRequestUnit)
          .find({
            where: { requestItemId: item.id, transferId: IsNull(), tenantId },
            relations: { stockUnit: true },
          });
        const physicalQuantity = preparedUnits.reduce(
          (sum, unit) => sum + unit.stockUnit.quantity,
          0,
        );
        if (physicalQuantity > 0 && physicalQuantity !== row.quantity) {
          throw new BadRequestException(
            `Los códigos preparados de ${item.variant.sku} suman ${physicalQuantity}; remítelos juntos`,
          );
        }
        const transferRepo = manager.getRepository(StockTransfer);
        const transfer = await transferRepo.save(
          transferRepo.create({
            type: 'TRANSFER',
            status: 'PENDING',
            variantId: item.variantId,
            fromWarehouseId: request.sourceWarehouseId,
            toWarehouseId: request.destinationWarehouseId,
            quantity: row.quantity,
            notes: `Solicitud ${request.requestNumber}`,
            createdById: userId,
            tenantId,
          }),
        );
        // La existencia y los códigos salen juntos: los preparados si los hay,
        // y si no, por antigüedad.
        await this.ledger.mover(manager, {
          variantId: item.variantId,
          warehouseId: request.sourceWarehouseId,
          cantidad: -row.quantity,
          motivo: 'INTERNAL_REQUEST_OUT',
          // La referencia es **esta remisión**, no el pedido entero: un pedido
          // puede salir en varios camiones, y al recibirlos el ledger tiene
          // que saber qué bultos venían en cuál. Con el id del pedido, recibir
          // el segundo camión reponía bultos que iban en el primero.
          referenciaId: transfer.id,
          notas: `Remisión ${request.requestNumber}`,
          usuarioId: userId,
          unidades: preparedUnits.length
            ? preparedUnits.map((prepared) => prepared.stockUnitId)
            : undefined,
          tenantId,
        });
        for (const prepared of preparedUnits) {
          prepared.transferId = transfer.id;
          await manager.getRepository(InternalRequestUnit).save(prepared);
        }
        await manager.getRepository(InternalRequestShipment).save(
          manager.getRepository(InternalRequestShipment).create({
            requestId: request.id,
            requestItemId: item.id,
            transferId: transfer.id,
            quantity: row.quantity,
            receivedAt: null,
            tenantId,
          }),
        );
        item.remittedQuantity += row.quantity;
        await manager.getRepository(InternalRequestItem).save(item);
      }
      const allRemitted = request.items.every(
        (item) => item.remittedQuantity >= item.requestedQuantity,
      );
      request.status = allRemitted
        ? InternalRequestStatus.REMITTED
        : InternalRequestStatus.PREPARED;
      if (allRemitted) request.remittedAt = new Date();
      await manager.getRepository(InternalRequest).save(request);
      return this.findOne(id, tenantId, manager);
    });
  }

  async receive(id: string, userId: string, tenantId: string) {
    return this.dataSource.transaction(async (manager) => {
      const request = await this.lock(manager, id, tenantId);
      const shipments = await manager
        .getRepository(InternalRequestShipment)
        .find({
          where: { requestId: id, receivedAt: IsNull(), tenantId },
          relations: { transfer: true },
          // Orden explícito: sin él Postgres devuelve las filas como le
          // convenga, y el resultado de recibir varias remisiones a la vez
          // dependía del azar.
          order: { createdAt: 'ASC', id: 'ASC' },
        });
      if (!shipments.length)
        throw new BadRequestException(
          'No hay remisiones pendientes por recibir',
        );
      for (const shipment of shipments) {
        if (shipment.transfer.status !== 'PENDING')
          throw new BadRequestException('Una remisión ya no está pendiente');
        const item = request.items.find(
          (candidate) => candidate.id === shipment.requestItemId,
        )!;
        shipment.transfer.status = 'RECEIVED';
        shipment.transfer.receivedById = userId;
        shipment.transfer.receivedAt = new Date();
        await manager.getRepository(StockTransfer).save(shipment.transfer);
        const units = await manager.getRepository(InternalRequestUnit).find({
          where: { transferId: shipment.transferId, tenantId },
          relations: { stockUnit: true },
        });
        // Lo que llega al punto entra con **su** código, el que salió de la
        // bodega: sin esto el ledger inventaría uno nuevo y la caja llegaría
        // con una etiqueta impresa que ya no coincide con el sistema.
        await this.ledger.mover(manager, {
          variantId: item.variantId,
          warehouseId: request.destinationWarehouseId,
          cantidad: shipment.quantity,
          motivo: 'INTERNAL_REQUEST_IN',
          referenciaId: shipment.transferId,
          notas: `Recepción ${request.requestNumber}`,
          usuarioId: userId,
          unidades: units.length
            ? units.map((prepared) => prepared.stockUnitId)
            : undefined,
          tenantId,
        });
        shipment.receivedAt = new Date();
        await manager.getRepository(InternalRequestShipment).save(shipment);
      }
      return this.findOne(id, tenantId, manager);
    });
  }

  async close(
    id: string,
    status: InternalRequestStatus.CANCELLED | InternalRequestStatus.RETURNED,
    userId: string,
    tenantId: string,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const request = await this.lock(manager, id, tenantId);
      const shipments = await manager
        .getRepository(InternalRequestShipment)
        .find({
          where: { requestId: id, tenantId },
          relations: { transfer: true },
          order: { createdAt: 'ASC', id: 'ASC' },
        });
      if (status === InternalRequestStatus.CANCELLED && shipments.length)
        throw new BadRequestException(
          'Una solicitud remitida se devuelve, no se cancela',
        );
      if (status === InternalRequestStatus.RETURNED) {
        if (
          !shipments.length ||
          shipments.some((shipment) => shipment.transfer.status !== 'PENDING')
        ) {
          throw new BadRequestException(
            'Solo se puede devolver una solicitud que sigue en tránsito',
          );
        }
        for (const shipment of shipments) {
          const item = request.items.find(
            (candidate) => candidate.id === shipment.requestItemId,
          )!;
          shipment.transfer.status = 'CANCELLED';
          await manager.getRepository(StockTransfer).save(shipment.transfer);
          const units = await manager.getRepository(InternalRequestUnit).find({
            where: { transferId: shipment.transferId, tenantId },
            relations: { stockUnit: true },
          });
          await this.ledger.mover(manager, {
            variantId: item.variantId,
            warehouseId: request.sourceWarehouseId!,
            cantidad: shipment.quantity,
            motivo: 'INTERNAL_REQUEST_RETURN',
            referenciaId: shipment.transferId,
            notas: `Devolución ${request.requestNumber}`,
            usuarioId: userId,
            unidades: units.length
              ? units.map((prepared) => prepared.stockUnitId)
              : undefined,
            tenantId,
          });
        }
      }
      request.status = status;
      request.closedAt = new Date();
      await manager.getRepository(InternalRequest).save(request);
      return this.findOne(id, tenantId, manager);
    });
  }

  async print(id: string, reprint: boolean, tenantId: string) {
    return this.dataSource.transaction(async (manager) => {
      const request = await this.lock(manager, id, tenantId);
      if (request.printCount > 0 && !reprint)
        throw new BadRequestException(
          'El ticket ya fue impreso. Confirma la reimpresión.',
        );
      request.printCount += 1;
      request.printedAt = new Date();
      await manager.getRepository(InternalRequest).save(request);
      return {
        requestNumber: request.requestNumber,
        source: request.sourceWarehouse?.name ?? 'Por asignar',
        destination: request.destinationWarehouse.name,
        reprint: request.printCount > 1,
        printedAt: request.printedAt,
        items: request.items.map((item) => ({
          sku: item.variant.sku,
          product: item.variant.product?.name ?? '',
          size: item.variant.sizeName,
          color: item.variant.colorName,
          requested: item.requestedQuantity,
          prepared: item.preparedQuantity,
        })),
      };
    });
  }

  async findOne(id: string, tenantId: string, manager?: EntityManager) {
    const repo = manager?.getRepository(InternalRequest) ?? this.repo;
    const request = await repo.findOne({
      where: { id, tenantId },
      relations: { items: { variant: { product: true } } },
    });
    if (!request) throw new NotFoundException('Solicitud no encontrada');
    const shipmentRepo =
      manager?.getRepository(InternalRequestShipment) ??
      this.dataSource.getRepository(InternalRequestShipment);
    const shipments = await shipmentRepo.find({
      where: { requestId: id, tenantId },
      relations: { transfer: true },
      order: { createdAt: 'ASC' },
    });
    return { ...request, shipments };
  }

  async findAll(
    tenantId: string,
    userId: string,
    status?: InternalRequestStatus,
    warehouseId?: string,
  ) {
    const qb = this.repo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.items', 'items')
      .leftJoinAndSelect('items.variant', 'variant')
      .leftJoinAndSelect('variant.product', 'product')
      .leftJoinAndSelect('r.destinationWarehouse', 'destination')
      .leftJoinAndSelect('r.sourceWarehouse', 'source')
      .where('r.tenant_id = :tenantId', { tenantId });
    if (status) qb.andWhere('r.status = :status', { status });
    if (warehouseId)
      qb.andWhere(
        '(r.destination_warehouse_id = :warehouseId OR r.source_warehouse_id = :warehouseId)',
        { warehouseId },
      );
    const allowed = await this.access.allowedWarehouses(userId);
    if (allowed) {
      if (allowed.length === 0) return [];
      qb.andWhere(
        '(r.destination_warehouse_id IN (:...allowed) OR r.source_warehouse_id IN (:...allowed))',
        { allowed },
      );
    }
    return qb.orderBy('r.created_at', 'DESC').getMany();
  }
}
