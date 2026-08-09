import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Return } from './entities/return.entity.js';
import { ReturnItem } from './entities/return-item.entity.js';
import { CreditNote } from './entities/credit-note.entity.js';
import { Sale } from '../pos/entities/sale.entity.js';
import { SaleItem } from '../pos/entities/sale-item.entity.js';
import { Stock } from '../inventory/entities/stock.entity.js';
import { StockMovement } from '../inventory/entities/stock-movement.entity.js';
import { CreateReturnDto } from './dto/create-return.dto.js';
import { ReturnStatus } from '../common/enums/return-status.enum.js';
import { SaleStatus } from '../common/enums/sale-status.enum.js';
import { MovementType } from '../common/enums/movement-type.enum.js';
import { retryOnUniqueViolation } from '../common/utils/db-errors.util.js';
import {
  StockUnit,
  StockUnitStatus,
} from '../inventory/entities/stock-unit.entity.js';
import {
  StockUnitEvent,
  StockUnitEventType,
} from '../inventory/entities/stock-unit-event.entity.js';
import { Warehouse } from '../inventory/entities/warehouse.entity.js';
import { User } from '../users/entities/user.entity.js';
import { Bank } from '../banks/entities/bank.entity.js';
import { PaymentMethod } from '../common/enums/payment-method.enum.js';
import { IncomeEntry } from '../incomes/entities/income-entry.entity.js';
import {
  IncomeCategory,
  IncomeType,
} from '../common/enums/income-type.enum.js';
import { AccountsReceivable } from '../pos/entities/accounts-receivable.entity.js';

const money = (value: number) => Math.round(value * 100) / 100;

@Injectable()
export class ReturnsService {
  constructor(
    @InjectRepository(Return)
    private readonly returnRepository: Repository<Return>,
    @InjectRepository(CreditNote)
    private readonly creditNoteRepository: Repository<CreditNote>,
    private readonly dataSource: DataSource,
  ) {}

  // Consecutivos por primer hueco libre, no por conteo: con registros borrados
  // el conteo devuelve un número ya usado y la devolución falla con un error
  // interno en vez de crearse.
  private async generateReturnNumber(tenantId: string): Promise<string> {
    const today = new Date();
    const prefix = `DEV-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
    const rows = await this.returnRepository
      .createQueryBuilder('r')
      .select('r.returnNumber', 'number')
      .where('r.return_number LIKE :prefix', { prefix: `${prefix}%` })
      .andWhere('r.tenant_id = :tenantId', { tenantId })
      .getRawMany<{ number: string }>();
    const taken = new Set(rows.map((r) => r.number));
    let n = 1;
    while (taken.has(`${prefix}-${String(n).padStart(4, '0')}`)) n++;
    return `${prefix}-${String(n).padStart(4, '0')}`;
  }

  private async generateCreditNoteNumber(tenantId: string): Promise<string> {
    const row = await this.creditNoteRepository
      .createQueryBuilder('cn')
      .select(
        "MAX(CAST(substring(cn.credit_note_number FROM '^NC-0*([0-9]+)$') AS integer))",
        'maxnum',
      )
      .where('cn.tenant_id = :tenantId', { tenantId })
      .andWhere("cn.credit_note_number ~ '^NC-[0-9]+$'")
      .getRawOne<{ maxnum: string | null }>();
    const next = (row?.maxnum ? parseInt(row.maxnum, 10) : 0) + 1;
    return `NC-${String(next).padStart(6, '0')}`;
  }

  /**
   * Create a return: validate sale, create return + items,
   * restore inventory, create credit note — all in a transaction.
   */
  async create(
    dto: CreateReturnDto,
    userId: string,
    tenantId: string,
  ): Promise<Return> {
    return retryOnUniqueViolation(async () =>
      this.dataSource.transaction(async (manager) => {
        const saleRepo = manager.getRepository(Sale);
        const returnRepo = manager.getRepository(Return);
        const returnItemRepo = manager.getRepository(ReturnItem);
        const creditNoteRepo = manager.getRepository(CreditNote);
        const stockRepo = manager.getRepository(Stock);
        const movementRepo = manager.getRepository(StockMovement);

        // La fila de venta serializa dos devoluciones concurrentes de la misma
        // factura. Sin este lock, ambas podrían leer el mismo saldo devolvible.
        const sale = await saleRepo.findOne({
          where: { id: dto.saleId, tenantId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!sale) {
          throw new NotFoundException('Venta no encontrada');
        }
        if (sale.status !== SaleStatus.COMPLETED) {
          throw new BadRequestException(
            'Solo se pueden devolver ventas completadas',
          );
        }

        const saleItems = await manager.getRepository(SaleItem).find({
          where: { saleId: sale.id, tenantId },
        });
        const duplicateItem = dto.items.find(
          (item, index) =>
            dto.items.findIndex(
              (candidate) => candidate.saleItemId === item.saleItemId,
            ) !== index,
        );
        if (duplicateItem) {
          throw new BadRequestException(
            'Cada item de venta puede aparecer una sola vez por devolución',
          );
        }

        const destinationWarehouseId =
          dto.destinationWarehouseId ?? sale.warehouseId;
        const destinationWarehouse = await manager
          .getRepository(Warehouse)
          .findOne({ where: { id: destinationWarehouseId, tenantId } });
        if (!destinationWarehouse) {
          throw new NotFoundException('Bodega destino no encontrada');
        }
        const receivedById = dto.receivedById ?? userId;
        const receivedBy = await manager
          .getRepository(User)
          .findOne({ where: { id: receivedById, tenantId } });
        if (!receivedBy) {
          throw new NotFoundException('Responsable de recepción no encontrado');
        }
        if (dto.settlementBankId) {
          const bank = await manager.getRepository(Bank).findOne({
            where: { id: dto.settlementBankId, tenantId, isActive: true },
          });
          if (!bank) throw new NotFoundException('Banco no encontrado');
        }

        const returnNumber = await this.generateReturnNumber(tenantId);
        let returnedTotal = 0;
        let replacementTotal = 0;

        const returnItemsData: {
          saleItem: SaleItem;
          quantity: number;
          returnedValue: number;
          returnedUnit: StockUnit | null;
          replacementUnit: StockUnit | null;
          replacementPrice: number | null;
        }[] = [];

        for (const itemDto of dto.items) {
          const saleItem = saleItems.find((i) => i.id === itemDto.saleItemId);
          if (!saleItem) {
            throw new NotFoundException(
              `Item de venta ${itemDto.saleItemId} no encontrado`,
            );
          }
          let returnedUnit: StockUnit | null = null;
          if (itemDto.returnedBarcode?.trim()) {
            returnedUnit = await manager.getRepository(StockUnit).findOne({
              where: { barcode: itemDto.returnedBarcode.trim(), tenantId },
              lock: { mode: 'pessimistic_write' },
            });
            if (!returnedUnit) {
              throw new NotFoundException(
                `Código devuelto ${itemDto.returnedBarcode} no encontrado`,
              );
            }
            if (saleItem.stockUnitId !== returnedUnit.id) {
              throw new BadRequestException(
                `El código ${returnedUnit.barcode} no pertenece a este item de la venta`,
              );
            }
            if (returnedUnit.status !== StockUnitStatus.SOLD) {
              throw new BadRequestException(
                `El código ${returnedUnit.barcode} no está vendido; estado actual: ${returnedUnit.status}`,
              );
            }
          }

          const quantity = returnedUnit?.quantity ?? itemDto.quantity;
          if (!quantity || !Number.isInteger(quantity) || quantity <= 0) {
            throw new BadRequestException(
              `Indica una cantidad o escanea el código físico de "${saleItem.productName}"`,
            );
          }
          if (
            returnedUnit &&
            itemDto.quantity &&
            itemDto.quantity !== quantity
          ) {
            throw new BadRequestException(
              `El código ${returnedUnit.barcode} representa ${quantity} unidad(es) y no admite devolución parcial`,
            );
          }

          const alreadyReturned = await returnItemRepo
            .createQueryBuilder('item')
            .innerJoin('item.return', 'ret')
            .select('COALESCE(SUM(item.quantity), 0)', 'quantity')
            .where('item.sale_item_id = :saleItemId', {
              saleItemId: saleItem.id,
            })
            .andWhere('item.tenant_id = :tenantId', { tenantId })
            .andWhere('ret.status = :status', {
              status: ReturnStatus.COMPLETED,
            })
            .getRawOne<{ quantity: string }>();
          const remaining =
            saleItem.quantity - Number(alreadyReturned?.quantity ?? 0);
          if (quantity > remaining) {
            throw new BadRequestException(
              `Cantidad a devolver (${quantity}) excede el saldo pendiente (${remaining}) para "${saleItem.productName}"`,
            );
          }

          let replacementUnit: StockUnit | null = null;
          let replacementPrice: number | null = null;
          if (itemDto.replacementBarcode?.trim()) {
            if (!returnedUnit) {
              throw new BadRequestException(
                'Un cambio por código exige escanear también el código devuelto',
              );
            }
            replacementUnit = await manager.getRepository(StockUnit).findOne({
              where: { barcode: itemDto.replacementBarcode.trim(), tenantId },
              lock: { mode: 'pessimistic_write' },
            });
            if (!replacementUnit) {
              throw new NotFoundException(
                `Código de reemplazo ${itemDto.replacementBarcode} no encontrado`,
              );
            }
            if (replacementUnit.id === returnedUnit.id) {
              throw new BadRequestException(
                'El código devuelto y el reemplazo deben ser diferentes',
              );
            }
            if (
              replacementUnit.status !== StockUnitStatus.IN_STOCK ||
              !replacementUnit.variantId
            ) {
              throw new BadRequestException(
                `El reemplazo ${replacementUnit.barcode} no está disponible`,
              );
            }
            if (itemDto.replacementPrice == null) {
              throw new BadRequestException(
                'Confirma el valor total del producto de reemplazo',
              );
            }
            replacementPrice = money(itemDto.replacementPrice);
            replacementTotal += replacementPrice;
          }

          const returnedValue = money(
            (Number(saleItem.lineTotal) / saleItem.quantity) * quantity,
          );
          returnedTotal += returnedValue;
          returnItemsData.push({
            saleItem,
            quantity,
            returnedValue,
            returnedUnit,
            replacementUnit,
            replacementPrice,
          });
        }

        returnedTotal = money(returnedTotal);
        replacementTotal = money(replacementTotal);
        const priceDifference = money(replacementTotal - returnedTotal);
        const hasPhysicalFlow = returnItemsData.some(
          (item) => item.returnedUnit || item.replacementUnit,
        );
        if (hasPhysicalFlow && priceDifference !== 0 && !dto.settlementMethod) {
          throw new BadRequestException(
            'Selecciona la forma de pago o reintegro de la diferencia',
          );
        }
        if (
          dto.settlementMethod === PaymentMethod.TRANSFERENCIA &&
          !dto.settlementBankId
        ) {
          throw new BadRequestException(
            'Selecciona el banco para la transferencia',
          );
        }

        const receivableRepo = manager.getRepository(AccountsReceivable);
        const receivable = await receivableRepo.findOne({
          where: { saleId: sale.id, tenantId },
          lock: { mode: 'pessimistic_write' },
        });
        let receivableRefundAmount = 0;
        if (
          receivable &&
          hasPhysicalFlow &&
          priceDifference !== 0 &&
          dto.settlementMethod !== PaymentMethod.CREDITO
        ) {
          throw new BadRequestException(
            'La venta tiene cartera: aplica la diferencia como crédito para no mover caja dos veces',
          );
        }
        if (receivable) {
          receivable.totalAmount = Math.max(
            0,
            money(Number(receivable.totalAmount) + priceDifference),
          );
          receivable.isFullyPaid =
            Number(receivable.paidAmount) >= Number(receivable.totalAmount);
          receivableRefundAmount = Math.max(
            0,
            money(
              Number(receivable.paidAmount) - Number(receivable.totalAmount),
            ),
          );
          receivable.fullyPaidAt = receivable.isFullyPaid ? new Date() : null;
          await receivableRepo.save(receivable);
        }

        // Create return
        const returnEntity = returnRepo.create({
          returnNumber,
          saleId: sale.id,
          clientId: sale.clientId,
          userId,
          reason: dto.reason,
          status: ReturnStatus.COMPLETED,
          refundAmount: receivable
            ? receivableRefundAmount
            : Math.max(-priceDifference, 0),
          priceDifference,
          settlementMethod: dto.settlementMethod ?? null,
          settlementBankId: dto.settlementBankId ?? null,
          settlementReference: dto.settlementReference?.trim() || null,
          receivedById,
          destinationWarehouseId,
          notes: dto.notes?.trim() || null,
          tenantId,
        });
        const savedReturn = await returnRepo.save(returnEntity);

        // La diferencia hace parte de la misma operación comercial. Un valor
        // positivo entra; uno negativo sale. Crédito no mueve caja/banco.
        if (
          priceDifference !== 0 &&
          !receivable &&
          dto.settlementMethod &&
          dto.settlementMethod !== PaymentMethod.CREDITO
        ) {
          const incomeRepo = manager.getRepository(IncomeEntry);
          await incomeRepo.save(
            incomeRepo.create({
              type: IncomeType.INGRESO,
              category: IncomeCategory.VENTAS,
              amount: priceDifference,
              method: dto.settlementMethod,
              bankId: dto.settlementBankId ?? null,
              note: `${priceDifference > 0 ? 'Cobro' : 'Reintegro'} de diferencia ${returnNumber}`,
              createdById: userId,
              tenantId,
            }),
          );
        }

        // Create return items + restore inventory
        for (const item of returnItemsData) {
          const {
            saleItem,
            quantity,
            returnedValue,
            returnedUnit,
            replacementUnit,
            replacementPrice,
          } = item;
          const ri = returnItemRepo.create({
            returnId: savedReturn.id,
            saleItemId: saleItem.id,
            variantId: saleItem.variantId,
            quantity,
            unitPrice: saleItem.unitPrice,
            returnedValue,
            stockUnitId: returnedUnit?.id ?? null,
            replacementStockUnitId: replacementUnit?.id ?? null,
            replacementVariantId: replacementUnit?.variantId ?? null,
            replacementPrice,
            tenantId,
          });
          await returnItemRepo.save(ri);

          const returnedVariantId =
            returnedUnit?.variantId ?? saleItem.variantId;
          if (!returnedVariantId) {
            throw new BadRequestException(
              `El código ${returnedUnit?.barcode} no tiene variante conciliada`,
            );
          }
          let stock = await stockRepo.findOne({
            where: {
              variantId: returnedVariantId,
              warehouseId: destinationWarehouseId,
              tenantId,
            },
            lock: { mode: 'pessimistic_write' },
          });
          if (!stock) {
            stock = stockRepo.create({
              variantId: returnedVariantId,
              warehouseId: destinationWarehouseId,
              quantity: 0,
              minStock: 0,
              tenantId,
            });
          }
          stock.quantity = Number(stock.quantity) + quantity;
          await stockRepo.save(stock);

          // Record movement
          const movement = movementRepo.create({
            variantId: returnedVariantId,
            warehouseId: destinationWarehouseId,
            movementType: MovementType.IN,
            quantity,
            referenceType: 'RETURN',
            referenceId: savedReturn.id,
            notes: `Devolución ${returnNumber}`,
            createdById: userId,
            tenantId,
          });
          await movementRepo.save(movement);

          if (returnedUnit) {
            returnedUnit.status = StockUnitStatus.IN_STOCK;
            returnedUnit.warehouseId = destinationWarehouseId;
            await manager.getRepository(StockUnit).save(returnedUnit);
            await manager.getRepository(StockUnitEvent).save(
              manager.getRepository(StockUnitEvent).create({
                stockUnitId: returnedUnit.id,
                eventType: StockUnitEventType.RETURNED,
                fromStatus: StockUnitStatus.SOLD,
                toStatus: StockUnitStatus.IN_STOCK,
                referenceType: 'RETURN',
                referenceId: savedReturn.id,
                userId,
                metadata: {
                  saleId: sale.id,
                  saleItemId: saleItem.id,
                  destinationWarehouseId,
                  receivedById,
                  replacementStockUnitId: replacementUnit?.id ?? null,
                },
                tenantId,
              }),
            );
          }

          if (replacementUnit?.variantId) {
            const replacementStock = await stockRepo.findOne({
              where: {
                variantId: replacementUnit.variantId,
                warehouseId: replacementUnit.warehouseId,
                tenantId,
              },
              lock: { mode: 'pessimistic_write' },
            });
            if (
              !replacementStock ||
              Number(replacementStock.quantity) < replacementUnit.quantity
            ) {
              throw new BadRequestException(
                `Stock agregado insuficiente para el reemplazo ${replacementUnit.barcode}`,
              );
            }
            replacementStock.quantity =
              Number(replacementStock.quantity) - replacementUnit.quantity;
            await stockRepo.save(replacementStock);
            await movementRepo.save(
              movementRepo.create({
                variantId: replacementUnit.variantId,
                warehouseId: replacementUnit.warehouseId,
                movementType: MovementType.OUT,
                quantity: replacementUnit.quantity,
                referenceType: 'RETURN_EXCHANGE',
                referenceId: savedReturn.id,
                notes: `Reemplazo en ${returnNumber}`,
                createdById: userId,
                tenantId,
              }),
            );
            replacementUnit.status = StockUnitStatus.SOLD;
            await manager.getRepository(StockUnit).save(replacementUnit);
            await manager.getRepository(StockUnitEvent).save(
              manager.getRepository(StockUnitEvent).create({
                stockUnitId: replacementUnit.id,
                eventType: StockUnitEventType.SOLD,
                fromStatus: StockUnitStatus.IN_STOCK,
                toStatus: StockUnitStatus.SOLD,
                referenceType: 'RETURN',
                referenceId: savedReturn.id,
                userId,
                metadata: {
                  exchangeForStockUnitId: returnedUnit?.id ?? null,
                  replacementPrice,
                  priceDifference,
                },
                tenantId,
              }),
            );
          }
        }

        // Create credit note
        const cnNumber = await this.generateCreditNoteNumber(tenantId);
        const creditNote = creditNoteRepo.create({
          creditNoteNumber: cnNumber,
          returnId: savedReturn.id,
          amount: returnedTotal,
          isApplied: Boolean(receivable),
          notes: `Nota crédito por devolución ${returnNumber}`,
          tenantId,
        });
        await creditNoteRepo.save(creditNote);

        // Return full entity
        const fullReturn = await returnRepo.findOne({
          where: { id: savedReturn.id, tenantId },
          relations: [
            'sale',
            'client',
            'user',
            'items',
            'items.variant',
            'items.stockUnit',
            'items.replacementStockUnit',
            'items.replacementVariant',
            'creditNotes',
            'receivedBy',
            'destinationWarehouse',
            'settlementBank',
          ],
        });
        if (!fullReturn) {
          throw new NotFoundException(
            'Devolución no encontrada después de crear',
          );
        }
        return fullReturn;
      }),
    );
  }

  async scanBarcode(barcode: string, tenantId: string) {
    const normalized = barcode.trim();
    const unit = await this.dataSource.getRepository(StockUnit).findOne({
      where: { barcode: normalized, tenantId },
      relations: {
        product: true,
        variant: true,
        size: true,
        color: true,
        warehouse: true,
      },
    });
    if (!unit) {
      throw new NotFoundException(
        `No existe ningún código físico "${normalized}" en esta tienda`,
      );
    }
    const saleItem = await this.dataSource.getRepository(SaleItem).findOne({
      where: { stockUnitId: unit.id, tenantId },
      relations: { sale: { client: true } },
      order: { createdAt: 'DESC' },
    });
    const priorReturn = saleItem
      ? await this.dataSource.getRepository(ReturnItem).findOne({
          where: {
            stockUnitId: unit.id,
            saleItemId: saleItem.id,
            tenantId,
          },
          relations: { return: true },
        })
      : null;
    const usedAsReplacement = await this.dataSource
      .getRepository(ReturnItem)
      .findOne({
        where: { replacementStockUnitId: unit.id, tenantId },
        relations: { return: true },
      });
    return {
      unit: {
        id: unit.id,
        barcode: unit.barcode,
        kind: unit.kind,
        status: unit.status,
        quantity: unit.quantity,
        productId: unit.productId,
        productName: unit.product?.name ?? '',
        variantId: unit.variantId,
        sku: unit.variant?.sku ?? '',
        size: unit.size?.name ?? '',
        color: unit.color?.name ?? '',
        warehouseId: unit.warehouseId,
        warehouseName: unit.warehouse?.name ?? '',
        suggestedPrice:
          Number(unit.variant?.priceOverride ?? unit.product?.basePrice ?? 0) *
          unit.quantity,
      },
      returnEligible:
        unit.status === StockUnitStatus.SOLD &&
        Boolean(saleItem) &&
        !priorReturn,
      replacementEligible: unit.status === StockUnitStatus.IN_STOCK,
      sale: saleItem?.sale ?? null,
      saleItem: saleItem
        ? {
            id: saleItem.id,
            productName: saleItem.productName,
            quantity: saleItem.quantity,
            unitPrice: Number(saleItem.unitPrice),
            lineTotal: Number(saleItem.lineTotal),
            stockUnitId: saleItem.stockUnitId,
          }
        : null,
      priorReturn: priorReturn?.return ?? null,
      usedAsReplacement: usedAsReplacement?.return ?? null,
    };
  }

  async searchSale(query: string, tenantId: string) {
    const normalized = query.trim();
    if (!normalized)
      throw new BadRequestException('Escribe una venta o factura');
    const qb = this.dataSource
      .getRepository(Sale)
      .createQueryBuilder('sale')
      .leftJoinAndSelect('sale.items', 'items')
      .leftJoinAndSelect('items.stockUnit', 'stockUnit')
      .leftJoinAndSelect('sale.client', 'client')
      .leftJoinAndSelect('sale.warehouse', 'warehouse')
      .leftJoinAndSelect('sale.accountsReceivable', 'accountsReceivable')
      .where('sale.tenant_id = :tenantId', { tenantId })
      .andWhere('sale.status = :status', { status: SaleStatus.COMPLETED })
      .andWhere(
        '(sale.sale_number = :query OR sale.invoice_number = :query' +
          (/^[0-9a-f-]{36}$/i.test(normalized) ? ' OR sale.id = :query' : '') +
          ')',
        { query: normalized },
      );
    const sale = await qb.getOne();
    if (!sale) throw new NotFoundException('Venta completada no encontrada');

    const returnedRows = await this.dataSource
      .getRepository(ReturnItem)
      .createQueryBuilder('item')
      .innerJoin('item.return', 'ret')
      .select('item.sale_item_id', 'saleItemId')
      .addSelect('SUM(item.quantity)', 'quantity')
      .where('item.tenant_id = :tenantId', { tenantId })
      .andWhere('ret.status = :status', { status: ReturnStatus.COMPLETED })
      .andWhere('item.sale_item_id IN (:...itemIds)', {
        itemIds: sale.items.map((item) => item.id),
      })
      .groupBy('item.sale_item_id')
      .getRawMany<{ saleItemId: string; quantity: string }>();
    const returnedByItem = new Map(
      returnedRows.map((row) => [row.saleItemId, Number(row.quantity)]),
    );
    return {
      ...sale,
      items: sale.items.map((item) => ({
        ...item,
        returnedQuantity: returnedByItem.get(item.id) ?? 0,
        returnableQuantity: item.quantity - (returnedByItem.get(item.id) ?? 0),
      })),
    };
  }

  async remit(
    id: string,
    destinationWarehouseId: string,
    userId: string,
    tenantId: string,
  ) {
    await this.dataSource.transaction(async (manager) => {
      const returnRepo = manager.getRepository(Return);
      const returnEntity = await returnRepo.findOne({
        where: { id, tenantId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!returnEntity)
        throw new NotFoundException('Devolución no encontrada');
      if (returnEntity.status !== ReturnStatus.COMPLETED) {
        throw new BadRequestException(
          'Solo se remiten devoluciones completadas',
        );
      }
      if (returnEntity.remittedAt) {
        throw new BadRequestException('Esta devolución ya fue remitida');
      }
      const destination = await manager.getRepository(Warehouse).findOne({
        where: { id: destinationWarehouseId, tenantId },
      });
      if (!destination)
        throw new NotFoundException('Bodega destino no encontrada');
      const physicalItems = await manager.getRepository(ReturnItem).find({
        where: { returnId: id, tenantId },
      });
      const tracked = physicalItems.filter((item) => item.stockUnitId);
      if (tracked.length === 0) {
        throw new BadRequestException(
          'Esta devolución no contiene códigos físicos para remitir',
        );
      }

      const stockRepo = manager.getRepository(Stock);
      const movementRepo = manager.getRepository(StockMovement);
      const unitRepo = manager.getRepository(StockUnit);
      const eventRepo = manager.getRepository(StockUnitEvent);
      for (const item of tracked) {
        const unit = await unitRepo.findOne({
          where: { id: item.stockUnitId!, tenantId },
          lock: { mode: 'pessimistic_write' },
        });
        if (
          !unit ||
          unit.status !== StockUnitStatus.IN_STOCK ||
          !unit.variantId
        ) {
          throw new BadRequestException(
            `El código devuelto ${unit?.barcode ?? item.stockUnitId} ya no está disponible para remitir`,
          );
        }
        const sourceWarehouseId = unit.warehouseId;
        if (sourceWarehouseId !== destinationWarehouseId) {
          const source = await stockRepo.findOne({
            where: {
              variantId: unit.variantId,
              warehouseId: sourceWarehouseId,
              tenantId,
            },
            lock: { mode: 'pessimistic_write' },
          });
          if (!source || Number(source.quantity) < unit.quantity) {
            throw new BadRequestException(
              `Stock agregado insuficiente para remitir ${unit.barcode}`,
            );
          }
          let target = await stockRepo.findOne({
            where: {
              variantId: unit.variantId,
              warehouseId: destinationWarehouseId,
              tenantId,
            },
            lock: { mode: 'pessimistic_write' },
          });
          if (!target) {
            target = stockRepo.create({
              variantId: unit.variantId,
              warehouseId: destinationWarehouseId,
              quantity: 0,
              minStock: 0,
              tenantId,
            });
          }
          source.quantity = Number(source.quantity) - unit.quantity;
          target.quantity = Number(target.quantity) + unit.quantity;
          await stockRepo.save([source, target]);
          await movementRepo.save([
            movementRepo.create({
              variantId: unit.variantId,
              warehouseId: sourceWarehouseId,
              tenantId,
              movementType: MovementType.TRANSFER,
              quantity: -unit.quantity,
              referenceType: 'RETURN_REMITTANCE',
              referenceId: returnEntity.id,
              notes: `Salida de ${returnEntity.returnNumber} hacia ${destination.name}`,
              createdById: userId,
            }),
            movementRepo.create({
              variantId: unit.variantId,
              warehouseId: destinationWarehouseId,
              tenantId,
              movementType: MovementType.TRANSFER,
              quantity: unit.quantity,
              referenceType: 'RETURN_REMITTANCE',
              referenceId: returnEntity.id,
              notes: `Entrada de ${returnEntity.returnNumber}`,
              createdById: userId,
            }),
          ]);
          unit.warehouseId = destinationWarehouseId;
          await unitRepo.save(unit);
          await eventRepo.save(
            eventRepo.create({
              stockUnitId: unit.id,
              eventType: StockUnitEventType.TRANSFERRED,
              fromStatus: StockUnitStatus.IN_STOCK,
              toStatus: StockUnitStatus.IN_STOCK,
              referenceType: 'RETURN',
              referenceId: returnEntity.id,
              userId,
              metadata: { sourceWarehouseId, destinationWarehouseId },
              tenantId,
            }),
          );
        }
      }
      returnEntity.remittanceWarehouseId = destinationWarehouseId;
      returnEntity.remittedById = userId;
      returnEntity.remittedAt = new Date();
      await returnRepo.save(returnEntity);
    });
    return this.findOne(id, tenantId);
  }

  async findAll(tenantId: string): Promise<Return[]> {
    return this.returnRepository.find({
      where: { tenantId },
      relations: [
        'sale',
        'client',
        'user',
        'items',
        'items.stockUnit',
        'creditNotes',
        'destinationWarehouse',
        'remittanceWarehouse',
        'remittedBy',
      ],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string, tenantId: string): Promise<Return> {
    const ret = await this.returnRepository.findOne({
      where: { id, tenantId },
      relations: [
        'sale',
        'client',
        'user',
        'items',
        'items.variant',
        'items.saleItem',
        'items.stockUnit',
        'items.replacementStockUnit',
        'items.replacementVariant',
        'creditNotes',
        'receivedBy',
        'destinationWarehouse',
        'settlementBank',
        'remittanceWarehouse',
        'remittedBy',
      ],
    });
    if (!ret) {
      throw new NotFoundException('Devolución no encontrada');
    }
    return ret;
  }

  async findCreditNotes(tenantId: string): Promise<CreditNote[]> {
    return this.creditNoteRepository.find({
      where: { tenantId },
      relations: ['return', 'return.sale', 'return.client'],
      order: { createdAt: 'DESC' },
    });
  }
}
