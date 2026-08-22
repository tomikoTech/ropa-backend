import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { StreetSeller } from './entities/street-seller.entity.js';
import {
  StreetDispatch,
  StreetDispatchStatus,
} from './entities/street-dispatch.entity.js';
import { StreetDispatchItem } from './entities/street-dispatch-item.entity.js';
import { ProductVariant } from '../products/entities/product-variant.entity.js';
import { Stock } from '../inventory/entities/stock.entity.js';
import { StockMovement } from '../inventory/entities/stock-movement.entity.js';
import {
  StockUnit,
  StockUnitKind,
  StockUnitStatus,
} from '../inventory/entities/stock-unit.entity.js';
import {
  StockUnitEvent,
  StockUnitEventType,
} from '../inventory/entities/stock-unit-event.entity.js';
import { Client } from '../clients/entities/client.entity.js';
import { Bank } from '../banks/entities/bank.entity.js';
import { Sale } from '../pos/entities/sale.entity.js';
import { SaleItem } from '../pos/entities/sale-item.entity.js';
import { Payment } from '../pos/entities/payment.entity.js';
import { MovementType } from '../common/enums/movement-type.enum.js';
import { SaleStatus } from '../common/enums/sale-status.enum.js';
import { SaleChannel } from '../common/enums/sale-channel.enum.js';
import { PaymentMethod } from '../common/enums/payment-method.enum.js';
import { retryOnUniqueViolation } from '../common/utils/db-errors.util.js';
import { InvoiceService } from '../pos/services/invoice.service.js';
import {
  buildSellerCode,
  settlementSummary,
  validateSettlement,
  type SettlementLine,
} from './street-settlement.js';
import type {
  CreateDispatchDto,
  CreateStreetSellerDto,
  SettleDispatchDto,
  UpdateStreetSellerDto,
} from './dto/street.dto.js';

/** Marca de los movimientos de inventario que genera la calle. */
const REF_DISPATCH = 'STREET_DISPATCH';

/** Estados que aún permiten operar sobre una remisión. */
const OPERABLE = StreetDispatchStatus.OPEN;

@Injectable()
export class StreetService {
  constructor(
    @InjectRepository(StreetSeller)
    private readonly sellerRepo: Repository<StreetSeller>,
    @InjectRepository(StreetDispatch)
    private readonly dispatchRepo: Repository<StreetDispatch>,
    @InjectRepository(StreetDispatchItem)
    private readonly itemRepo: Repository<StreetDispatchItem>,
    private readonly dataSource: DataSource,
    private readonly invoiceService: InvoiceService,
  ) {}

  // ── Patinadores ──────────────────────────────────────────────────────────

  listSellers(tenantId: string, includeInactive = false) {
    return this.sellerRepo.find({
      where: includeInactive ? { tenantId } : { tenantId, isActive: true },
      order: { name: 'ASC' },
    });
  }

  async createSeller(dto: CreateStreetSellerDto, tenantId: string) {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('El patinador necesita un nombre');

    // El código se genera solo: en el sistema anterior el patinador podía
    // quedar sin código y entonces no se le podía despachar nada.
    return retryOnUniqueViolation(async () => {
      const row = await this.sellerRepo
        .createQueryBuilder('s')
        .select(
          "MAX(CAST(substring(s.code FROM '^77(\\d{6})') AS integer))",
          'max',
        )
        .where('s.tenant_id = :tenantId', { tenantId })
        .getRawOne<{ max: string | null }>();

      return this.sellerRepo.save(
        this.sellerRepo.create({
          name,
          code: buildSellerCode(Number(row?.max ?? 0) + 1),
          documentNumber: dto.documentNumber?.trim() || null,
          phone: dto.phone?.trim() || null,
          notes: dto.notes?.trim() || null,
          tenantId,
        }),
      );
    });
  }

  async updateSeller(id: string, dto: UpdateStreetSellerDto, tenantId: string) {
    const seller = await this.sellerRepo.findOne({ where: { id, tenantId } });
    if (!seller) throw new NotFoundException('El patinador no existe');

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name)
        throw new BadRequestException('El patinador necesita un nombre');
      seller.name = name;
    }
    if (dto.documentNumber !== undefined) {
      seller.documentNumber = dto.documentNumber.trim() || null;
    }
    if (dto.phone !== undefined) seller.phone = dto.phone.trim() || null;
    if (dto.notes !== undefined) seller.notes = dto.notes.trim() || null;

    if (dto.isActive === false) {
      // Desactivar a alguien que tiene mercancía en la calle dejaría la remisión
      // sin poder cuadrarse.
      const abiertas = await this.dispatchRepo.count({
        where: {
          tenantId,
          streetSellerId: id,
          status: StreetDispatchStatus.OPEN,
        },
      });
      if (abiertas > 0) {
        throw new ConflictException(
          `${seller.name} tiene ${abiertas} remisión(es) sin cuadrar. ` +
            `Cuádralas antes de desactivarlo.`,
        );
      }
    }
    if (dto.isActive !== undefined) seller.isActive = dto.isActive;

    return this.sellerRepo.save(seller);
  }

  /**
   * Buscar por el código del carnet (lo que hace el lector al despachar).
   *
   * Si está inactivo lo dice: el sistema anterior devolvía un rechazo seco y
   * quien despachaba no sabía si el carnet estaba mal leído o el patinador
   * estaba dado de baja.
   */
  async findSellerByCode(code: string, tenantId: string) {
    const seller = await this.sellerRepo.findOne({
      where: { code: code.trim(), tenantId },
    });
    if (!seller) {
      throw new NotFoundException(
        `Ningún patinador tiene el carnet "${code.trim()}". ` +
          `Revisa la lectura o búscalo por nombre.`,
      );
    }
    if (!seller.isActive) {
      throw new BadRequestException(
        `${seller.name} está desactivado: no se le puede despachar mercancía. ` +
          `Actívalo si volvió a trabajar.`,
      );
    }
    return seller;
  }

  // ── Utilidades ───────────────────────────────────────────────────────────

  /**
   * Bloquea la remisión y confirma, ya dentro de la transacción, que sigue
   * abierta. Leer el estado antes de abrir la transacción no sirve: dos
   * peticiones simultáneas ven las dos `OPEN` y las dos siguen adelante.
   */
  private async lockDispatch(
    manager: EntityManager,
    id: string,
    tenantId: string,
  ): Promise<void> {
    const rows: { status: StreetDispatchStatus }[] = await manager.query(
      'SELECT status FROM street_dispatches WHERE id = $1 AND tenant_id = $2 FOR UPDATE',
      [id, tenantId],
    );
    if (!rows.length) throw new NotFoundException('La remisión no existe');
    if (rows[0].status !== OPERABLE) {
      throw new ConflictException(
        `Otra persona acaba de ${
          rows[0].status === StreetDispatchStatus.SETTLED ? 'cuadrar' : 'anular'
        } esta remisión. Recarga la pantalla para ver cómo quedó.`,
      );
    }
  }

  /** El cliente al que se factura tiene que ser de esta tienda. */
  private async assertClient(clientId: string, tenantId: string) {
    const exists = await this.dataSource
      .getRepository(Client)
      .findOne({ where: { id: clientId, tenantId }, select: { id: true } });
    if (!exists) throw new NotFoundException('El cliente no existe');
  }

  /** El banco del recaudo también. */
  private async assertBank(bankId: string, tenantId: string) {
    const exists = await this.dataSource
      .getRepository(Bank)
      .findOne({ where: { id: bankId, tenantId }, select: { id: true } });
    if (!exists) throw new NotFoundException('El banco no existe');
  }

  // ── Despachar ────────────────────────────────────────────────────────────

  private async nextDispatchNumber(
    manager: EntityManager,
    tenantId: string,
  ): Promise<string> {
    const row = await manager
      .getRepository(StreetDispatch)
      .createQueryBuilder('d')
      .select(
        "MAX(CAST(substring(d.dispatch_number FROM '^RRP-0*([0-9]+)$') AS integer))",
        'max',
      )
      .where('d.tenant_id = :tenantId', { tenantId })
      .getRawOne<{ max: string | null }>();
    return `RRP-${String(Number(row?.max ?? 0) + 1).padStart(5, '0')}`;
  }

  /**
   * Entrega mercancía a un patinador.
   *
   * Todo en una transacción y **en una sola llamada**: el sistema anterior manda
   * el despacho en paquetes de 20 renglones por un límite de su cliente, y si un
   * paquete falla queda media remisión hecha.
   */
  async createDispatch(
    dto: CreateDispatchDto,
    userId: string,
    tenantId: string,
  ) {
    if (!dto.items?.length) {
      throw new BadRequestException(
        'El despacho necesita al menos un producto',
      );
    }

    const seller = await this.sellerRepo.findOne({
      where: { id: dto.streetSellerId, tenantId },
    });
    if (!seller) throw new NotFoundException('El patinador no existe');
    if (!seller.isActive) {
      throw new BadRequestException(
        `${seller.name} está desactivado: no se le puede despachar mercancía.`,
      );
    }

    const dispatchId = await retryOnUniqueViolation(async () =>
      this.dataSource.transaction(async (manager) => {
        const dispatch = await manager.getRepository(StreetDispatch).save(
          manager.getRepository(StreetDispatch).create({
            dispatchNumber: await this.nextDispatchNumber(manager, tenantId),
            streetSellerId: seller.id,
            warehouseId: dto.warehouseId,
            createdById: userId,
            notes: dto.notes?.trim() || null,
            status: StreetDispatchStatus.OPEN,
            tenantId,
          }),
        );

        for (const line of dto.items) {
          const variant = await manager.getRepository(ProductVariant).findOne({
            where: { id: line.variantId, tenantId },
            relations: ['product'],
          });
          if (!variant) {
            throw new NotFoundException(
              `La referencia ${line.variantId} no existe`,
            );
          }

          // Con lock: sin él, dos despachos simultáneos de la misma referencia
          // leen el mismo disponible y el inventario queda en negativo.
          const stock = await manager.getRepository(Stock).findOne({
            where: {
              variantId: line.variantId,
              warehouseId: dto.warehouseId,
              tenantId,
            },
            lock: { mode: 'pessimistic_write' },
          });
          const disponible = Number(stock?.quantity ?? 0);
          if (disponible < line.quantity) {
            throw new BadRequestException(
              `No hay suficiente "${variant.product.name}" ` +
                `${variant.sizeName}/${variant.colorName} en esa bodega: ` +
                `hay ${disponible} y se están despachando ${line.quantity}.`,
            );
          }

          // Sale del inventario: está en la calle, no en la bodega.
          stock!.quantity = disponible - line.quantity;
          await manager.getRepository(Stock).save(stock!);

          await manager.getRepository(StockMovement).save(
            manager.getRepository(StockMovement).create({
              variantId: line.variantId,
              warehouseId: dto.warehouseId,
              movementType: MovementType.OUT,
              quantity: line.quantity,
              referenceType: REF_DISPATCH,
              referenceId: dispatch.id,
              notes: `Remisión rápida ${dispatch.dispatchNumber} a ${seller.name}`,
              createdById: userId,
              tenantId,
            }),
          );

          if (line.stockUnitId) {
            const unitRepo = manager.getRepository(StockUnit);
            const unit = await unitRepo.findOne({
              where: { id: line.stockUnitId, tenantId },
            });
            if (!unit) throw new NotFoundException('El código no existe');
            if (unit.status !== StockUnitStatus.IN_STOCK) {
              throw new BadRequestException(
                `${unit.kind === StockUnitKind.BOX ? 'La caja' : 'El par'} ${unit.barcode} ya no está disponible.`,
              );
            }
            await unitRepo.update(
              { id: unit.id, tenantId },
              { status: StockUnitStatus.CONSIGNED },
            );
            await manager.getRepository(StockUnitEvent).save(
              manager.getRepository(StockUnitEvent).create({
                stockUnitId: unit.id,
                eventType: StockUnitEventType.CONSIGNED,
                fromStatus: StockUnitStatus.IN_STOCK,
                toStatus: StockUnitStatus.CONSIGNED,
                referenceType: REF_DISPATCH,
                referenceId: dispatch.id,
                userId,
                metadata: {
                  dispatchNumber: dispatch.dispatchNumber,
                  seller: seller.name,
                },
                tenantId,
              }),
            );
          }

          const precio =
            line.unitPrice ??
            Number(variant.priceOverride ?? variant.product.basePrice);

          await manager.getRepository(StreetDispatchItem).save(
            manager.getRepository(StreetDispatchItem).create({
              dispatchId: dispatch.id,
              variantId: variant.id,
              productName: variant.product.name,
              variantSku: variant.sku,
              // El código del escáner viaja con el despacho: el patinador sale
              // con la mercancía y el papel, y así se cuadra por código.
              variantBarcode: variant.barcode ?? null,
              variantSize: variant.sizeName,
              variantColor: variant.colorName,
              stockUnitId: line.stockUnitId ?? null,
              quantity: line.quantity,
              unitPrice: precio,
              // Snapshot del costo: la utilidad de la calle no debe cambiar
              // cuando cambie el costo del producto.
              unitCost: Number(variant.product.costPrice) || 0,
              tenantId,
            }),
          );
        }

        return dispatch.id;
      }),
    );

    return this.findDispatch(dispatchId, tenantId);
  }

  // ── Consultar ────────────────────────────────────────────────────────────

  async listDispatches(
    filters: {
      streetSellerId?: string;
      warehouseId?: string;
      status?: string;
    },
    tenantId: string,
  ) {
    const qb = this.dispatchRepo
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.seller', 'seller')
      .leftJoinAndSelect('d.warehouse', 'warehouse')
      .leftJoinAndSelect('d.items', 'items')
      .where('d.tenant_id = :tenantId', { tenantId })
      .orderBy('d.created_at', 'DESC');

    if (filters.streetSellerId) {
      qb.andWhere('d.street_seller_id = :sid', { sid: filters.streetSellerId });
    }
    if (filters.warehouseId) {
      qb.andWhere('d.warehouse_id = :wid', { wid: filters.warehouseId });
    }
    if (filters.status) {
      qb.andWhere('d.status = :status', { status: filters.status });
    }

    const dispatches = await qb.getMany();
    return dispatches.map((d) => this.withSummary(d));
  }

  async findDispatch(id: string, tenantId: string) {
    const dispatch = await this.dispatchRepo.findOne({
      where: { id, tenantId },
      relations: ['seller', 'warehouse', 'items'],
    });
    if (!dispatch) throw new NotFoundException('La remisión no existe');
    return this.withSummary(dispatch);
  }

  /** La remisión con su cuadratura, que es lo que se mira siempre. */
  private withSummary(dispatch: StreetDispatch) {
    const cobrado =
      dispatch.collectedAmount === null ||
      dispatch.collectedAmount === undefined
        ? null
        : Number(dispatch.collectedAmount);
    const summary = settlementSummary(
      (dispatch.items ?? []).map((i) => ({
        id: i.id,
        productName: i.productName,
        variantSize: i.variantSize,
        variantColor: i.variantColor,
        quantity: i.quantity,
        unitPrice: Number(i.unitPrice),
        unitCost: Number(i.unitCost),
        quantitySold: i.quantitySold,
        quantityReturned: i.quantityReturned,
      })),
    );
    return {
      ...dispatch,
      summary: {
        ...summary,
        /** Plata que entregó (null mientras la remisión siga abierta). */
        collected: cobrado,
        /** Plata que quedó debiendo por lo que sí vendió. */
        pendingCash:
          cobrado === null
            ? 0
            : Math.max(0, Math.round((summary.revenue - cobrado) * 100) / 100),
      },
    };
  }

  // ── Cuadrar ──────────────────────────────────────────────────────────────

  /**
   * El patinador vuelve: se registra qué vendió, qué devolvió y qué falta.
   *
   * Lo devuelto entra otra vez al inventario. **Lo vendido se convierte en una
   * venta de verdad**, así que entra a la caja, al cierre del día y a la
   * utilidad sin que nadie la vuelva a digitar. Lo que falta no desaparece:
   * queda registrado como faltante en la remisión y se ve en el reporte.
   */
  async settle(
    id: string,
    dto: SettleDispatchDto,
    userId: string,
    tenantId: string,
  ) {
    const dispatch = await this.dispatchRepo.findOne({
      where: { id, tenantId },
      relations: ['items', 'seller'],
    });
    if (!dispatch) throw new NotFoundException('La remisión no existe');
    if (dispatch.status !== StreetDispatchStatus.OPEN) {
      throw new BadRequestException(
        `La remisión ${dispatch.dispatchNumber} ya está ` +
          `${dispatch.status === StreetDispatchStatus.SETTLED ? 'cuadrada' : 'anulada'}.`,
      );
    }
    if (dto.clientId) await this.assertClient(dto.clientId, tenantId);
    for (const payment of dto.payments ?? []) {
      if (payment.bankId) await this.assertBank(payment.bankId, tenantId);
    }

    const items = dispatch.items.map((i) => ({
      id: i.id,
      productName: i.productName,
      variantSize: i.variantSize,
      variantColor: i.variantColor,
      quantity: i.quantity,
      unitPrice: Number(i.unitPrice),
      unitCost: Number(i.unitCost),
    }));
    const lines: SettlementLine[] = dto.items.map((l) => ({
      itemId: l.itemId,
      sold: l.sold,
      returned: l.returned,
    }));

    const errores = validateSettlement(items, lines);
    if (errores.length) throw new BadRequestException(errores);

    const summary = settlementSummary(items, lines);

    // El pago no puede ser mayor de lo que se vendió: es el defecto del sistema
    // anterior (aceptaba un abono de $5.000 sobre una venta de $1.000) y aquí se
    // valida en el servidor.
    // Sin formas de pago se asume que entregó todo en efectivo (es el atajo de
    // la pantalla); con formas de pago, manda lo que se registró.
    const cobrado = dto.payments?.length
      ? dto.payments.reduce((s, p) => s + p.amount, 0)
      : summary.revenue;
    if (cobrado > summary.revenue + 0.01) {
      throw new BadRequestException(
        `Se está registrando un cobro de $${cobrado.toLocaleString('es-CO')} ` +
          `sobre una venta de $${summary.revenue.toLocaleString('es-CO')}.`,
      );
    }

    // Envuelto en `retryOnUniqueViolation` porque al cuadrar se crea una venta,
    // y su consecutivo se calcula con MAX+1: si en ese instante el POS cierra
    // otra venta, los dos números colisionan. Sin el reintento, cuadrar una
    // remisión fallaría con un conflicto justo en la hora de más movimiento.
    await retryOnUniqueViolation(async () =>
      this.dataSource.transaction(async (manager) => {
        // El estado se vuelve a leer **dentro** de la transacción y con la fila
        // bloqueada: dos clics seguidos en "Cuadrar" creaban dos ventas y
        // devolvían la mercancía dos veces al inventario.
        await this.lockDispatch(manager, dispatch.id, tenantId);

        const byId = new Map(lines.map((l) => [l.itemId, l]));

        for (const item of dispatch.items) {
          const line = byId.get(item.id)!;
          await manager
            .getRepository(StreetDispatchItem)
            .update(
              { id: item.id, tenantId },
              { quantitySold: line.sold, quantityReturned: line.returned },
            );

          if (line.returned > 0) {
            const stockRepo = manager.getRepository(Stock);
            let stock = await stockRepo.findOne({
              where: {
                variantId: item.variantId,
                warehouseId: dispatch.warehouseId,
                tenantId,
              },
              lock: { mode: 'pessimistic_write' },
            });
            if (!stock) {
              stock = stockRepo.create({
                variantId: item.variantId,
                warehouseId: dispatch.warehouseId,
                quantity: 0,
                tenantId,
              });
            }
            stock.quantity = Number(stock.quantity) + line.returned;
            await stockRepo.save(stock);

            await manager.getRepository(StockMovement).save(
              manager.getRepository(StockMovement).create({
                variantId: item.variantId,
                warehouseId: dispatch.warehouseId,
                movementType: MovementType.IN,
                quantity: line.returned,
                referenceType: REF_DISPATCH,
                referenceId: dispatch.id,
                notes:
                  `Devolución de ${dispatch.dispatchNumber} ` +
                  `(${dispatch.seller.name})`,
                createdById: userId,
                tenantId,
              }),
            );
          }

          // El bulto etiquetado: vendido si se vendió, de vuelta si volvió.
          if (item.stockUnitId) {
            const nextStatus =
              line.sold > 0
                ? StockUnitStatus.SOLD
                : line.returned > 0
                  ? StockUnitStatus.IN_STOCK
                  : StockUnitStatus.WRITTEN_OFF;
            await manager.getRepository(StockUnit).update(
              { id: item.stockUnitId, tenantId },
              {
                status: nextStatus,
              },
            );
            await manager.getRepository(StockUnitEvent).save(
              manager.getRepository(StockUnitEvent).create({
                stockUnitId: item.stockUnitId,
                eventType:
                  nextStatus === StockUnitStatus.SOLD
                    ? StockUnitEventType.SOLD
                    : nextStatus === StockUnitStatus.IN_STOCK
                      ? StockUnitEventType.RETURNED
                      : StockUnitEventType.WRITTEN_OFF,
                fromStatus: StockUnitStatus.CONSIGNED,
                toStatus: nextStatus,
                referenceType: REF_DISPATCH,
                referenceId: dispatch.id,
                userId,
                metadata: {
                  sold: line.sold,
                  returned: line.returned,
                  dispatchNumber: dispatch.dispatchNumber,
                },
                tenantId,
              }),
            );
          }
        }

        let saleId: string | null = null;
        if (summary.sold > 0) {
          saleId = await this.createStreetSale(
            manager,
            dispatch,
            items,
            lines,
            dto,
            summary.revenue,
            cobrado,
            userId,
            tenantId,
          );
        }

        await manager.getRepository(StreetDispatch).update(
          { id: dispatch.id, tenantId },
          {
            status: StreetDispatchStatus.SETTLED,
            settledAt: new Date(),
            settledById: userId,
            saleId,
            collectedAmount: summary.sold > 0 ? cobrado : 0,
          },
        );
      }),
    );

    return this.findDispatch(id, tenantId);
  }

  /**
   * La venta de lo que el patinador vendió en la calle.
   *
   * **No descuenta inventario**: la mercancía ya salió al despachar, y volver a
   * descontarla dejaría el stock en negativo. El movimiento de inventario de
   * esta venta es el `OUT` del despacho, y la venta queda apuntando a la
   * remisión en sus notas para que la trazabilidad no se pierda.
   */
  private async createStreetSale(
    manager: EntityManager,
    dispatch: StreetDispatch,
    items: { id: string; unitPrice: number; unitCost: number }[],
    lines: SettlementLine[],
    dto: SettleDispatchDto,
    revenue: number,
    collected: number,
    userId: string,
    tenantId: string,
  ): Promise<string> {
    const byId = new Map(items.map((i) => [i.id, i]));
    const dispatchItems = new Map(dispatch.items.map((i) => [i.id, i]));
    // Lo que el patinador quedó debiendo. La venta no puede darse por pagada
    // mientras exista: así aparece en "pendientes de pago" y la caja cuadra
    // con la plata que de verdad entró.
    const pendiente = Math.max(
      0,
      Math.round((revenue - collected) * 100) / 100,
    );

    const sale = await manager.getRepository(Sale).save(
      manager.getRepository(Sale).create({
        saleNumber: await this.invoiceService.generateSaleNumber(tenantId),
        invoiceNumber:
          await this.invoiceService.generateInvoiceNumber(tenantId),
        clientId: dto.clientId,
        userId,
        warehouseId: dispatch.warehouseId,
        subtotal: revenue,
        discountAmount: 0,
        // La venta de calle no factura IVA aparte: el precio de calle es el que
        // se cobró. Si el negocio necesita discriminarlo, el reporte lo calcula
        // con la tasa de la tienda.
        taxAmount: 0,
        total: revenue,
        status: SaleStatus.COMPLETED,
        saleChannel: SaleChannel.CALLE,
        isPaid: pendiente <= 0.01,
        notes:
          `Venta de calle — remisión ${dispatch.dispatchNumber} ` +
          `(${dispatch.seller.name})` +
          (pendiente > 0.01
            ? ` · Pendiente de cobro: $${pendiente.toLocaleString('es-CO')}`
            : ''),
        tenantId,
      }),
    );

    for (const line of lines) {
      if (line.sold <= 0) continue;
      const item = byId.get(line.itemId)!;
      const original = dispatchItems.get(line.itemId)!;
      await manager.getRepository(SaleItem).save(
        manager.getRepository(SaleItem).create({
          saleId: sale.id,
          variantId: original.variantId,
          productName: original.productName,
          variantSku: original.variantSku,
          variantBarcode: original.variantBarcode ?? null,
          variantSize: original.variantSize,
          variantColor: original.variantColor,
          quantity: line.sold,
          unitPrice: item.unitPrice,
          unitCost: item.unitCost,
          stockUnitId: original.stockUnitId,
          discountPercent: 0,
          taxRate: 0,
          taxAmount: 0,
          lineTotal: item.unitPrice * line.sold,
          tenantId,
        }),
      );
    }

    const payments = dto.payments?.length
      ? dto.payments
      : [{ method: PaymentMethod.EFECTIVO, amount: revenue }];
    for (const p of payments) {
      await manager.getRepository(Payment).save(
        manager.getRepository(Payment).create({
          saleId: sale.id,
          method: p.method,
          amount: p.amount,
          bankId: p.bankId ?? null,
          reference: p.reference,
          receivedAmount: p.amount,
          changeAmount: 0,
          tenantId,
        }),
      );
    }

    return sale.id;
  }

  /** Anular: la mercancía vuelve completa al inventario. */
  async cancelDispatch(id: string, userId: string, tenantId: string) {
    const dispatch = await this.dispatchRepo.findOne({
      where: { id, tenantId },
      relations: ['items', 'seller'],
    });
    if (!dispatch) throw new NotFoundException('La remisión no existe');
    if (dispatch.status !== StreetDispatchStatus.OPEN) {
      throw new BadRequestException(
        `Solo se puede anular una remisión sin cuadrar. ` +
          `${dispatch.dispatchNumber} ya está ` +
          `${dispatch.status === StreetDispatchStatus.SETTLED ? 'cuadrada' : 'anulada'}.`,
      );
    }

    await this.dataSource.transaction(async (manager) => {
      // Igual que al cuadrar: el estado manda dentro de la transacción.
      await this.lockDispatch(manager, dispatch.id, tenantId);

      for (const item of dispatch.items) {
        const stockRepo = manager.getRepository(Stock);
        let stock = await stockRepo.findOne({
          where: {
            variantId: item.variantId,
            warehouseId: dispatch.warehouseId,
            tenantId,
          },
          lock: { mode: 'pessimistic_write' },
        });
        if (!stock) {
          stock = stockRepo.create({
            variantId: item.variantId,
            warehouseId: dispatch.warehouseId,
            quantity: 0,
            tenantId,
          });
        }
        stock.quantity = Number(stock.quantity) + item.quantity;
        await stockRepo.save(stock);

        await manager.getRepository(StockMovement).save(
          manager.getRepository(StockMovement).create({
            variantId: item.variantId,
            warehouseId: dispatch.warehouseId,
            movementType: MovementType.IN,
            quantity: item.quantity,
            referenceType: REF_DISPATCH,
            referenceId: dispatch.id,
            notes: `Anulación de ${dispatch.dispatchNumber}`,
            createdById: userId,
            tenantId,
          }),
        );

        if (item.stockUnitId) {
          await manager
            .getRepository(StockUnit)
            .update(
              { id: item.stockUnitId, tenantId },
              { status: StockUnitStatus.IN_STOCK },
            );
          await manager.getRepository(StockUnitEvent).save(
            manager.getRepository(StockUnitEvent).create({
              stockUnitId: item.stockUnitId,
              eventType: StockUnitEventType.RETURNED,
              fromStatus: StockUnitStatus.CONSIGNED,
              toStatus: StockUnitStatus.IN_STOCK,
              referenceType: REF_DISPATCH,
              referenceId: dispatch.id,
              userId,
              metadata: {
                reason: 'DISPATCH_CANCELLED',
                dispatchNumber: dispatch.dispatchNumber,
              },
              tenantId,
            }),
          );
        }
      }

      await manager
        .getRepository(StreetDispatch)
        .update(
          { id: dispatch.id, tenantId },
          { status: StreetDispatchStatus.CANCELLED },
        );
    });

    return this.findDispatch(id, tenantId);
  }
}
