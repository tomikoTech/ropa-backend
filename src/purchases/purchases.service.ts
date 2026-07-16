import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { PurchaseOrder } from './entities/purchase-order.entity.js';
import { PurchaseOrderItem } from './entities/purchase-order-item.entity.js';
import { AccountsPayable } from './entities/accounts-payable.entity.js';
import { AccountsPayablePayment } from './entities/accounts-payable-payment.entity.js';
import { ProductVariant } from '../products/entities/product-variant.entity.js';
import { Stock } from '../inventory/entities/stock.entity.js';
import { StockMovement } from '../inventory/entities/stock-movement.entity.js';
import { StoreSettings } from '../storefront/entities/store-settings.entity.js';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto.js';
import { UpdatePurchaseOrderDto } from './dto/update-purchase-order.dto.js';
import { ReceiveItemsDto } from './dto/receive-items.dto.js';
import { PurchaseOrderStatus } from '../common/enums/purchase-order-status.enum.js';
import { MovementType } from '../common/enums/movement-type.enum.js';

@Injectable()
export class PurchasesService {
  constructor(
    @InjectRepository(PurchaseOrder)
    private readonly poRepository: Repository<PurchaseOrder>,
    @InjectRepository(PurchaseOrderItem)
    private readonly poItemRepository: Repository<PurchaseOrderItem>,
    @InjectRepository(AccountsPayable)
    private readonly apRepository: Repository<AccountsPayable>,
    @InjectRepository(AccountsPayablePayment)
    private readonly apPaymentRepository: Repository<AccountsPayablePayment>,
    @InjectRepository(ProductVariant)
    private readonly variantRepository: Repository<ProductVariant>,
    @InjectRepository(StoreSettings)
    private readonly settingsRepository: Repository<StoreSettings>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Resuelve el desglose de IVA de una compra. `applyTax` decide si se aplica;
   * si es undefined, usa el default del tenant (ivaEnabled). La tasa es única
   * por tienda (ivaRate). IVA agregado sobre el subtotal (no incluido).
   */
  private async computePurchaseTotals(
    items: { quantityOrdered: number; unitCost: number }[],
    applyTax: boolean | undefined,
    tenantId: string,
    settings?: StoreSettings | null,
  ): Promise<{
    subtotal: number;
    taxRate: number;
    taxAmount: number;
    total: number;
  }> {
    const s =
      settings ??
      (await this.settingsRepository.findOne({ where: { tenantId } }));
    const ivaEnabled = s ? s.ivaEnabled : true;
    const doApply = applyTax ?? ivaEnabled;
    const rate = doApply ? (s ? Number(s.ivaRate) : 19) : 0;
    const mode = s?.ivaMode === 'added' ? 'added' : 'included';

    const gross = items.reduce(
      (sum, i) => sum + i.quantityOrdered * i.unitCost,
      0,
    );
    const round = (v: number) => Math.round(v * 100) / 100;

    if (rate <= 0) {
      return {
        subtotal: round(gross),
        taxRate: 0,
        taxAmount: 0,
        total: round(gross),
      };
    }

    if (mode === 'added') {
      // El costo es la base; el IVA se suma → total = subtotal + IVA.
      const subtotal = round(gross);
      const taxAmount = round(gross * (rate / 100));
      return {
        subtotal,
        taxRate: rate,
        taxAmount,
        total: round(subtotal + taxAmount),
      };
    }
    // 'included': el costo ya incluye IVA → se extrae, el total no cambia.
    const subtotal = round(gross / (1 + rate / 100));
    return {
      subtotal,
      taxRate: rate,
      taxAmount: round(gross - subtotal),
      total: round(gross),
    };
  }

  private async generateOrderNumber(tenantId: string): Promise<string> {
    const today = new Date();
    const prefix = `OC-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;

    const count = await this.poRepository
      .createQueryBuilder('po')
      .where('po.order_number LIKE :prefix', { prefix: `${prefix}%` })
      .andWhere('po.tenant_id = :tenantId', { tenantId })
      .getCount();

    return `${prefix}-${String(count + 1).padStart(4, '0')}`;
  }

  async create(
    dto: CreatePurchaseOrderDto,
    userId: string,
    tenantId: string,
  ): Promise<PurchaseOrder> {
    // Validate variants exist and collect product images
    const variantImageMap = new Map<string, string | null>();
    for (const item of dto.items) {
      const variant = await this.variantRepository.findOne({
        where: { id: item.variantId, tenantId },
        relations: ['product'],
      });
      if (!variant) {
        throw new NotFoundException(`Variante ${item.variantId} no encontrada`);
      }
      variantImageMap.set(item.variantId, variant.product?.imageUrl || null);
    }

    const orderNumber = await this.generateOrderNumber(tenantId);
    const { subtotal, taxRate, taxAmount, total } =
      await this.computePurchaseTotals(dto.items, dto.applyTax, tenantId);

    const po = this.poRepository.create({
      orderNumber,
      supplierId: dto.supplierId,
      warehouseId: dto.warehouseId,
      createdById: userId,
      subtotal,
      taxRate,
      taxAmount,
      total,
      notes: dto.notes,
      status: PurchaseOrderStatus.DRAFT,
      tenantId,
    });

    const savedPo = await this.poRepository.save(po);

    const items = dto.items.map((i) =>
      this.poItemRepository.create({
        purchaseOrderId: savedPo.id,
        variantId: i.variantId,
        quantityOrdered: i.quantityOrdered,
        unitCost: i.unitCost,
        productImageUrl: variantImageMap.get(i.variantId) || undefined,
        tenantId,
      }),
    );
    await this.poItemRepository.save(items);

    // Create accounts payable if due date provided
    if (dto.paymentDueDate) {
      const ap = this.apRepository.create({
        purchaseOrderId: savedPo.id,
        amount: total,
        dueDate: new Date(dto.paymentDueDate),
        tenantId,
      });
      await this.apRepository.save(ap);
    }

    return this.findOne(savedPo.id, tenantId);
  }

  async findAll(
    filters:
      | {
          status?: PurchaseOrderStatus;
          supplierId?: string;
        }
      | undefined,
    tenantId: string,
  ): Promise<PurchaseOrder[]> {
    const where: Record<string, unknown> = { tenantId };
    if (filters?.status) where.status = filters.status;
    if (filters?.supplierId) where.supplierId = filters.supplierId;

    return this.poRepository.find({
      where,
      relations: [
        'supplier',
        'warehouse',
        'createdBy',
        'items',
        'items.variant',
        'items.variant.product',
        'accountsPayable',
      ],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string, tenantId: string): Promise<PurchaseOrder> {
    const po = await this.poRepository.findOne({
      where: { id, tenantId },
      relations: [
        'supplier',
        'warehouse',
        'createdBy',
        'items',
        'items.variant',
        'items.variant.product',
        'accountsPayable',
      ],
    });
    if (!po) {
      throw new NotFoundException('Orden de compra no encontrada');
    }
    return po;
  }

  async send(id: string, tenantId: string): Promise<PurchaseOrder> {
    const po = await this.findOne(id, tenantId);
    if (po.status !== PurchaseOrderStatus.DRAFT) {
      throw new BadRequestException(
        'Solo se pueden enviar órdenes en estado borrador',
      );
    }
    po.status = PurchaseOrderStatus.SENT;
    await this.poRepository.save(po);
    return this.findOne(id, tenantId);
  }

  /**
   * Edita una orden de compra en cualquier estado excepto CANCELLED.
   *
   * - DRAFT / SENT: nada fue recibido, no hay inventario que tocar; solo se
   *   reemplazan ítems/campos y se recalcula el total.
   * - PARTIAL / RECEIVED: el inventario ya fue afectado. Se hace REVERSIÓN
   *   TOTAL de lo recibido (movimientos OUT sobre la bodega original) y luego
   *   se RE-APLICAN los ítems editados como recibidos (movimientos IN sobre la
   *   bodega destino), dejando la orden en estado RECEIVED. Todo en una única
   *   transacción para que sea atómico.
   */
  async update(
    id: string,
    dto: UpdatePurchaseOrderDto,
    userId: string,
    tenantId: string,
  ): Promise<PurchaseOrder> {
    await this.dataSource.transaction(async (manager) => {
      const poRepo = manager.getRepository(PurchaseOrder);
      const poItemRepo = manager.getRepository(PurchaseOrderItem);
      const apRepo = manager.getRepository(AccountsPayable);
      const variantRepo = manager.getRepository(ProductVariant);
      const stockRepo = manager.getRepository(Stock);
      const movementRepo = manager.getRepository(StockMovement);

      const po = await poRepo.findOne({
        where: { id, tenantId },
        relations: ['items'],
      });
      if (!po) {
        throw new NotFoundException('Orden de compra no encontrada');
      }
      if (po.status === PurchaseOrderStatus.CANCELLED) {
        throw new BadRequestException('No se puede editar una orden cancelada');
      }

      const wasReceived =
        po.status === PurchaseOrderStatus.RECEIVED ||
        po.status === PurchaseOrderStatus.PARTIAL;
      const oldWarehouseId = po.warehouseId;

      // 1) REVERSIÓN: descontar del inventario todo lo que esta orden había
      //    recibido, en la bodega original, con movimiento OUT de auditoría.
      if (wasReceived) {
        for (const item of po.items) {
          if (item.quantityReceived > 0) {
            const stock = await stockRepo.findOne({
              where: {
                variantId: item.variantId,
                warehouseId: oldWarehouseId,
                tenantId,
              },
            });
            if (stock) {
              stock.quantity -= item.quantityReceived;
              await stockRepo.save(stock);
            }
            await movementRepo.save(
              movementRepo.create({
                variantId: item.variantId,
                warehouseId: oldWarehouseId,
                movementType: MovementType.OUT,
                quantity: item.quantityReceived,
                referenceType: 'PURCHASE',
                referenceId: po.id,
                notes: `Reversión edición OC ${po.orderNumber}`,
                createdById: userId,
                tenantId,
              }),
            );
          }
        }
      }

      // 2) Campos de cabecera
      if (dto.supplierId !== undefined) po.supplierId = dto.supplierId;
      if (dto.warehouseId !== undefined) po.warehouseId = dto.warehouseId;
      if (dto.notes !== undefined) po.notes = dto.notes;

      // 3) Ítems efectivos: los del dto (validando variantes) o los actuales.
      let effective: {
        variantId: string;
        quantityOrdered: number;
        unitCost: number;
        productImageUrl?: string;
      }[];
      if (dto.items) {
        effective = [];
        for (const item of dto.items) {
          const variant = await variantRepo.findOne({
            where: { id: item.variantId, tenantId },
            relations: ['product'],
          });
          if (!variant) {
            throw new NotFoundException(
              `Variante ${item.variantId} no encontrada`,
            );
          }
          effective.push({
            variantId: item.variantId,
            quantityOrdered: item.quantityOrdered,
            unitCost: item.unitCost,
            productImageUrl: variant.product?.imageUrl || undefined,
          });
        }
      } else {
        effective = po.items.map((i) => ({
          variantId: i.variantId,
          quantityOrdered: i.quantityOrdered,
          unitCost: i.unitCost,
          productImageUrl: i.productImageUrl || undefined,
        }));
      }

      // 4) Reemplazar ítems. Si la orden ya estaba recibida, los nuevos ítems
      //    quedan como totalmente recibidos y se re-aplica el inventario.
      await poItemRepo.delete({ purchaseOrderId: po.id, tenantId });
      const newItems = effective.map((i) =>
        poItemRepo.create({
          purchaseOrderId: po.id,
          variantId: i.variantId,
          quantityOrdered: i.quantityOrdered,
          unitCost: i.unitCost,
          quantityReceived: wasReceived ? i.quantityOrdered : 0,
          productImageUrl: i.productImageUrl,
          tenantId,
        }),
      );
      const savedNewItems = await poItemRepo.save(newItems);
      // Reemplazar la colección en memoria para que el save() de la orden no
      // intente re-insertar (vía cascade) los ítems viejos ya eliminados.
      po.items = savedNewItems;

      if (wasReceived) {
        for (const i of effective) {
          let stock = await stockRepo.findOne({
            where: {
              variantId: i.variantId,
              warehouseId: po.warehouseId,
              tenantId,
            },
          });
          if (stock) {
            stock.quantity += i.quantityOrdered;
            await stockRepo.save(stock);
          } else {
            stock = stockRepo.create({
              variantId: i.variantId,
              warehouseId: po.warehouseId,
              quantity: i.quantityOrdered,
              minStock: 3,
              tenantId,
            });
            await stockRepo.save(stock);
          }
          await movementRepo.save(
            movementRepo.create({
              variantId: i.variantId,
              warehouseId: po.warehouseId,
              movementType: MovementType.IN,
              quantity: i.quantityOrdered,
              referenceType: 'PURCHASE',
              referenceId: po.id,
              notes: `Re-aplicación edición OC ${po.orderNumber}`,
              createdById: userId,
              tenantId,
            }),
          );
        }
        po.status = PurchaseOrderStatus.RECEIVED;
      }

      // 5) Totales (con IVA opcional) y guardado. Si el dto no trae applyTax,
      //    se conserva si la orden ya tenía IVA (taxRate > 0).
      const applyTax =
        dto.applyTax !== undefined ? dto.applyTax : Number(po.taxRate) > 0;
      const settings = await manager
        .getRepository(StoreSettings)
        .findOne({ where: { tenantId } });
      const totals = await this.computePurchaseTotals(
        effective,
        applyTax,
        tenantId,
        settings,
      );
      po.subtotal = totals.subtotal;
      po.taxRate = totals.taxRate;
      po.taxAmount = totals.taxAmount;
      po.total = totals.total;
      await poRepo.save(po);

      // 6) Sincronizar cuenta por pagar (si existe y no está pagada)
      const ap = await apRepo.findOne({
        where: { purchaseOrderId: po.id, tenantId },
      });
      if (ap) {
        if (!ap.isPaid) {
          ap.amount = po.total;
          if (dto.paymentDueDate) ap.dueDate = new Date(dto.paymentDueDate);
          await apRepo.save(ap);
        }
      } else if (dto.paymentDueDate) {
        await apRepo.save(
          apRepo.create({
            purchaseOrderId: po.id,
            amount: po.total,
            dueDate: new Date(dto.paymentDueDate),
            tenantId,
          }),
        );
      }
    });

    return this.findOne(id, tenantId);
  }

  async receiveItems(
    id: string,
    dto: ReceiveItemsDto,
    userId: string,
    tenantId: string,
  ): Promise<PurchaseOrder> {
    return this.dataSource.transaction(async (manager) => {
      const poRepo = manager.getRepository(PurchaseOrder);
      const poItemRepo = manager.getRepository(PurchaseOrderItem);
      const stockRepo = manager.getRepository(Stock);
      const movementRepo = manager.getRepository(StockMovement);

      const po = await poRepo.findOne({
        where: { id, tenantId },
        relations: ['items'],
      });

      if (!po) {
        throw new NotFoundException('Orden de compra no encontrada');
      }
      if (
        po.status !== PurchaseOrderStatus.SENT &&
        po.status !== PurchaseOrderStatus.PARTIAL
      ) {
        throw new BadRequestException(
          'Solo se pueden recibir items de órdenes enviadas o parciales',
        );
      }

      for (const receiveItem of dto.items) {
        const poItem = po.items.find((i) => i.id === receiveItem.itemId);
        if (!poItem) {
          throw new NotFoundException(
            `Item ${receiveItem.itemId} no encontrado en la orden`,
          );
        }

        const remaining = poItem.quantityOrdered - poItem.quantityReceived;
        if (receiveItem.quantityReceived > remaining) {
          throw new BadRequestException(
            `Cantidad recibida (${receiveItem.quantityReceived}) excede pendiente (${remaining}) para item ${poItem.id}`,
          );
        }

        // Update received quantity
        poItem.quantityReceived += receiveItem.quantityReceived;
        await poItemRepo.save(poItem);

        // Add to stock
        let stock = await stockRepo.findOne({
          where: {
            variantId: poItem.variantId,
            warehouseId: po.warehouseId,
            tenantId,
          },
        });

        if (stock) {
          stock.quantity += receiveItem.quantityReceived;
          await stockRepo.save(stock);
        } else {
          stock = stockRepo.create({
            variantId: poItem.variantId,
            warehouseId: po.warehouseId,
            quantity: receiveItem.quantityReceived,
            minStock: 3,
            tenantId,
          });
          await stockRepo.save(stock);
        }

        // Record stock movement
        const movement = movementRepo.create({
          variantId: poItem.variantId,
          warehouseId: po.warehouseId,
          movementType: MovementType.IN,
          quantity: receiveItem.quantityReceived,
          referenceType: 'PURCHASE',
          referenceId: po.id,
          notes: `Recepción OC ${po.orderNumber}`,
          createdById: userId,
          tenantId,
        });
        await movementRepo.save(movement);
      }

      // Update order status
      const updatedItems = await poItemRepo.find({
        where: { purchaseOrderId: id, tenantId },
      });
      const allReceived = updatedItems.every(
        (i) => i.quantityReceived >= i.quantityOrdered,
      );
      const someReceived = updatedItems.some((i) => i.quantityReceived > 0);

      if (allReceived) {
        po.status = PurchaseOrderStatus.RECEIVED;
      } else if (someReceived) {
        po.status = PurchaseOrderStatus.PARTIAL;
      }
      await poRepo.save(po);

      // Return full order from transaction manager
      const fullPo = await poRepo.findOne({
        where: { id, tenantId },
        relations: [
          'supplier',
          'warehouse',
          'createdBy',
          'items',
          'items.variant',
          'items.variant.product',
          'accountsPayable',
        ],
      });
      if (!fullPo) {
        throw new NotFoundException('Orden no encontrada después de recibir');
      }
      return fullPo;
    });
  }

  async cancel(id: string, tenantId: string): Promise<PurchaseOrder> {
    const po = await this.findOne(id, tenantId);
    if (po.status === PurchaseOrderStatus.RECEIVED) {
      throw new BadRequestException(
        'No se puede cancelar una orden completamente recibida',
      );
    }
    po.status = PurchaseOrderStatus.CANCELLED;
    await this.poRepository.save(po);
    return this.findOne(id, tenantId);
  }

  // ─── Accounts Payable ───

  async findAllAccountsPayable(
    filters:
      | {
          isPaid?: boolean;
        }
      | undefined,
    tenantId: string,
  ): Promise<AccountsPayable[]> {
    const where: Record<string, unknown> = { tenantId };
    if (filters?.isPaid !== undefined) where.isPaid = filters.isPaid;

    return this.apRepository.find({
      where,
      relations: ['purchaseOrder', 'purchaseOrder.supplier', 'payments'],
      order: { dueDate: 'ASC' },
    });
  }

  async markAsPaid(
    apId: string,
    receiptImageUrl: string | undefined,
    tenantId: string,
  ): Promise<AccountsPayable> {
    const ap = await this.apRepository.findOne({
      where: { id: apId, tenantId },
      relations: ['purchaseOrder', 'purchaseOrder.supplier'],
    });
    if (!ap) {
      throw new NotFoundException('Cuenta por pagar no encontrada');
    }
    if (ap.isPaid) {
      throw new BadRequestException('Esta cuenta ya fue pagada');
    }
    ap.isPaid = true;
    ap.paidAt = new Date();
    if (receiptImageUrl) {
      ap.receiptImageUrl = receiptImageUrl;
    }
    return this.apRepository.save(ap);
  }

  async addApPayment(
    apId: string,
    dto: {
      amount: number;
      method: string;
      reference?: string;
      receiptImageUrl?: string;
      notes?: string;
    },
    tenantId: string,
  ): Promise<AccountsPayable> {
    const ap = await this.apRepository.findOne({
      where: { id: apId, tenantId },
      relations: ['payments', 'purchaseOrder', 'purchaseOrder.supplier'],
    });
    if (!ap) throw new NotFoundException('Cuenta por pagar no encontrada');
    if (ap.isPaid)
      throw new BadRequestException('Esta cuenta ya fue pagada completamente');

    const remaining = Number(ap.amount) - Number(ap.paidAmount);
    if (dto.amount > remaining) {
      throw new BadRequestException(
        `El monto excede el saldo pendiente de ${remaining}`,
      );
    }

    const payment = this.apPaymentRepository.create({
      accountsPayableId: apId,
      amount: dto.amount,
      method: dto.method,
      reference: dto.reference,
      receiptImageUrl: dto.receiptImageUrl,
      notes: dto.notes,
      tenantId,
    });
    await this.apPaymentRepository.save(payment);

    const newPaidAmount = Number(ap.paidAmount) + dto.amount;
    const isNowPaid = newPaidAmount >= Number(ap.amount);

    await this.apRepository.update(
      { id: apId, tenantId },
      {
        paidAmount: newPaidAmount,
        ...(isNowPaid ? { isPaid: true, paidAt: new Date() } : {}),
      },
    );

    return this.apRepository.findOne({
      where: { id: apId, tenantId },
      relations: ['payments', 'purchaseOrder', 'purchaseOrder.supplier'],
    }) as Promise<AccountsPayable>;
  }
}
