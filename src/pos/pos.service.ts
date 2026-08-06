import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In, ILike } from 'typeorm';
import { Sale } from './entities/sale.entity.js';
import { SaleItem } from './entities/sale-item.entity.js';
import { Payment } from './entities/payment.entity.js';
import { ProductVariant } from '../products/entities/product-variant.entity.js';
import { Stock } from '../inventory/entities/stock.entity.js';
import { StockMovement } from '../inventory/entities/stock-movement.entity.js';
import { Client } from '../clients/entities/client.entity.js';
import { AccountsReceivable } from './entities/accounts-receivable.entity.js';
import { AccountsReceivablePayment } from './entities/accounts-receivable-payment.entity.js';
import { CreateSaleDto } from './dto/create-sale.dto.js';
import { RecordArPaymentDto } from './dto/record-ar-payment.dto.js';
import { TaxService, LineCalculation } from './services/tax.service.js';
import { InvoiceService } from './services/invoice.service.js';
import { ProductStatus } from '../common/enums/product-status.enum.js';
import { ReceiptService, ReceiptData } from './services/receipt.service.js';
import { InvoiceEmailService } from '../common/services/invoice-email.service.js';
import { StoreSettings } from '../storefront/entities/store-settings.entity.js';
import { Reservation } from '../reservations/entities/reservation.entity.js';
import { SaleStatus } from '../common/enums/sale-status.enum.js';
import { SaleChannel } from '../common/enums/sale-channel.enum.js';
import { PaymentMethod } from '../common/enums/payment-method.enum.js';
import { MovementType } from '../common/enums/movement-type.enum.js';
import { retryOnUniqueViolation } from '../common/utils/db-errors.util.js';

@Injectable()
export class PosService {
  constructor(
    @InjectRepository(Sale)
    private readonly saleRepository: Repository<Sale>,
    @InjectRepository(SaleItem)
    private readonly saleItemRepository: Repository<SaleItem>,
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    @InjectRepository(AccountsReceivable)
    private readonly arRepository: Repository<AccountsReceivable>,
    @InjectRepository(AccountsReceivablePayment)
    private readonly arPaymentRepository: Repository<AccountsReceivablePayment>,
    @InjectRepository(ProductVariant)
    private readonly variantRepository: Repository<ProductVariant>,
    @InjectRepository(Stock)
    private readonly stockRepository: Repository<Stock>,
    @InjectRepository(StoreSettings)
    private readonly storeSettingsRepo: Repository<StoreSettings>,
    private readonly dataSource: DataSource,
    private readonly taxService: TaxService,
    private readonly invoiceService: InvoiceService,
    private readonly receiptService: ReceiptService,
    private readonly invoiceEmailService: InvoiceEmailService,
  ) {}

  /**
   * Create and complete a sale in a single transaction.
   * 1. Validate stock availability
   * 2. Calculate taxes
   * 3. Validate payment covers total
   * 4. Create sale + items + payments
   * 5. Deduct inventory
   * 6. Record stock movements
   */
  async createSale(
    dto: CreateSaleDto,
    userId: string,
    tenantId: string,
  ): Promise<Sale> {
    // El consecutivo de venta/factura se calcula leyendo el último existente:
    // dos cajas vendiendo a la vez pueden elegir el mismo número y chocar contra
    // el índice único. Reintentar la transacción completa (rollback + recálculo)
    // evita que la caja vea un "error interno" al cobrar.
    const fullSale = await retryOnUniqueViolation(async () =>
      this.dataSource.transaction(async (manager) => {
        const variantRepo = manager.getRepository(ProductVariant);
        const stockRepo = manager.getRepository(Stock);
        const movementRepo = manager.getRepository(StockMovement);
        const saleRepo = manager.getRepository(Sale);
        const saleItemRepo = manager.getRepository(SaleItem);
        const paymentRepo = manager.getRepository(Payment);

        // If clientId not provided, use generic client
        let clientId = dto.clientId;
        if (!clientId) {
          const generic = await manager.getRepository(Client).findOne({
            where: { isGeneric: true, tenantId },
          });
          if (generic) {
            clientId = generic.id;
          }
        } else {
          // Validate specific client belongs to tenant
          const client = await manager.getRepository(Client).findOne({
            where: { id: dto.clientId, tenantId },
          });
          if (!client) {
            throw new NotFoundException('Cliente no encontrado');
          }
        }

        // IVA config per tenant. `applyTax` en el DTO permite decidir por venta;
        // si no viene, se usa el default del tenant (ivaEnabled). La tasa es única
        // por tienda (ivaRate), ignorando el tax_rate por producto.
        const storeSettings = await manager
          .getRepository(StoreSettings)
          .findOne({ where: { tenantId } });
        const ivaEnabled = storeSettings ? storeSettings.ivaEnabled : true;
        const applyTax = dto.applyTax ?? ivaEnabled;
        const storeIvaRate = storeSettings ? Number(storeSettings.ivaRate) : 19;
        const effectiveTaxRate = applyTax ? storeIvaRate : 0;
        const ivaMode =
          storeSettings?.ivaMode === 'added' ? 'added' : 'included';

        // Load and validate all variants + stock
        const lineCalcs: LineCalculation[] = [];
        const variantData: {
          variant: ProductVariant;
          stocks: Stock[];
          quantity: number;
          discountPercent: number;
          lineCalc: LineCalculation;
        }[] = [];

        // Batch load all stocks for requested variants (1 query instead of N)
        const allVariantIds = dto.items.map((i) => i.variantId);
        const allStocks = await stockRepo.find({
          where: { variantId: In(allVariantIds), tenantId },
        });
        const stocksByVariant = new Map<string, Stock[]>();
        for (const s of allStocks) {
          const arr = stocksByVariant.get(s.variantId);
          if (arr) arr.push(s);
          else stocksByVariant.set(s.variantId, [s]);
        }

        // Separados / apartados (F6): si el tenant lo tiene habilitado, el stock
        // reservado para OTROS clientes no está disponible para esta venta. Los
        // apartados del mismo cliente se consumen al vender (ver más abajo).
        const reservationsEnabled = !!storeSettings?.reservationsEnabled;
        const reservationRepo = manager.getRepository(Reservation);
        let activeReservations: Reservation[] = [];
        const reservedTotal = new Map<string, number>();
        const reservedByClient = new Map<string, number>();
        if (reservationsEnabled) {
          activeReservations = await reservationRepo.find({
            where: { tenantId, status: 'ACTIVE', variantId: In(allVariantIds) },
          });
          for (const r of activeReservations) {
            reservedTotal.set(
              r.variantId,
              (reservedTotal.get(r.variantId) ?? 0) + Number(r.quantity),
            );
            if (clientId && r.clientId === clientId) {
              reservedByClient.set(
                r.variantId,
                (reservedByClient.get(r.variantId) ?? 0) + Number(r.quantity),
              );
            }
          }
        }

        for (const item of dto.items) {
          const variant = await variantRepo.findOne({
            where: { id: item.variantId },
            relations: ['product'],
          });
          if (!variant) {
            throw new NotFoundException(
              `Variante ${item.variantId} no encontrada`,
            );
          }
          if (variant.tenantId !== tenantId) {
            throw new NotFoundException(
              `Variante ${item.variantId} no encontrada`,
            );
          }
          if (
            !variant.isActive ||
            variant.product.status !== ProductStatus.ACTIVE
          ) {
            throw new BadRequestException(
              `Producto "${variant.product.name}" (${variant.sku}) no está activo`,
            );
          }

          // Cascade stock check: primary warehouse first, then others by qty desc
          const itemStocks = stocksByVariant.get(item.variantId) || [];
          itemStocks.sort((a, b) => {
            if (a.warehouseId === dto.warehouseId) return -1;
            if (b.warehouseId === dto.warehouseId) return 1;
            return Number(b.quantity) - Number(a.quantity);
          });
          const totalAvailable = itemStocks.reduce(
            (sum, s) => sum + Number(s.quantity),
            0,
          );
          // Apartados de otros clientes reducen el disponible para esta venta.
          const reservedOthers =
            (reservedTotal.get(item.variantId) ?? 0) -
            (reservedByClient.get(item.variantId) ?? 0);
          const effectiveAvailable = totalAvailable - reservedOthers;
          if (effectiveAvailable < item.quantity) {
            const reservedMsg =
              reservedOthers > 0 ? ` (${reservedOthers} apartado(s))` : '';
            throw new BadRequestException(
              `Stock insuficiente para "${variant.product.name}" ${variant.size}/${variant.color}. ` +
                `Disponible: ${effectiveAvailable}${reservedMsg}, Solicitado: ${item.quantity}`,
            );
          }

          // Precio: el editado manualmente en el POS tiene prioridad; si no,
          // priceOverride de la variante y luego basePrice del producto.
          const defaultPrice = variant.priceOverride
            ? Number(variant.priceOverride)
            : Number(variant.product.basePrice);
          const unitPrice =
            item.unitPrice != null && Number(item.unitPrice) >= 0
              ? Number(item.unitPrice)
              : defaultPrice;
          const taxRate = effectiveTaxRate;
          const discountPercent = item.discountPercent || 0;

          const lineCalc = this.taxService.calculateLine(
            unitPrice,
            item.quantity,
            discountPercent,
            taxRate,
            ivaMode,
          );
          lineCalcs.push(lineCalc);

          variantData.push({
            variant,
            stocks: itemStocks,
            quantity: item.quantity,
            discountPercent,
            lineCalc,
          });
        }

        // Calculate sale totals
        const saleTotals = this.taxService.calculateSaleTotals(lineCalcs);

        // Separate regular payments from credit
        const regularPayments = dto.payments.filter(
          (p) => p.method !== PaymentMethod.CREDITO,
        );
        const creditPayments = dto.payments.filter(
          (p) => p.method === PaymentMethod.CREDITO,
        );
        const totalRegular = regularPayments.reduce(
          (sum, p) => sum + p.amount,
          0,
        );
        const totalCredit = creditPayments.reduce(
          (sum, p) => sum + p.amount,
          0,
        );

        // Venta PENDIENTE DE PAGO: no-crédito que no se marca como pagada al crear.
        // No exige cubrir el total ni registra pagos; se marca luego desde Ventas.
        const isPending = dto.markAsPaid === false && totalCredit === 0;

        if (!isPending && totalRegular + totalCredit < saleTotals.total) {
          throw new BadRequestException(
            `Pago insuficiente. Total: $${saleTotals.total}, Pagado: $${totalRegular + totalCredit}`,
          );
        }

        // If credit, require real client and due date
        if (totalCredit > 0) {
          const client = clientId
            ? await manager
                .getRepository(Client)
                .findOne({ where: { id: clientId, tenantId } })
            : null;
          if (!client || client.isGeneric) {
            throw new BadRequestException(
              'Las ventas a crédito requieren un cliente registrado (no genérico)',
            );
          }
          if (!dto.creditDueDate) {
            throw new BadRequestException(
              'Las ventas a crédito requieren fecha de vencimiento',
            );
          }
        }

        // Generate numbers
        const saleNumber =
          await this.invoiceService.generateSaleNumber(tenantId);
        const invoiceNumber =
          await this.invoiceService.generateInvoiceNumber(tenantId);

        // Create sale
        const sale = saleRepo.create({
          saleNumber,
          invoiceNumber,
          clientId,
          userId,
          warehouseId: dto.warehouseId,
          subtotal: saleTotals.subtotal,
          discountAmount: saleTotals.discountAmount,
          taxAmount: saleTotals.taxAmount,
          total: saleTotals.total,
          status: SaleStatus.COMPLETED,
          saleChannel: dto.saleChannel || SaleChannel.POS,
          isPaid: !isPending,
          notes: dto.notes,
          tenantId,
        });
        const savedSale = await saleRepo.save(sale);

        // Puntas + comisión (F2): si el tenant activó la comisión por punta, se
        // marca el ítem y se calcula la comisión (fija por par o % del valor).
        const leftoverCommissionEnabled =
          !!storeSettings?.leftoverCommissionEnabled;

        // Create sale items
        for (const data of variantData) {
          let isLeftover = false;
          let commissionAmount = 0;
          if (leftoverCommissionEnabled) {
            isLeftover = await this.isProductLeftover(
              manager,
              data.variant.product,
              storeSettings,
              tenantId,
            );
            if (isLeftover) {
              const mode = storeSettings.leftoverCommissionMode;
              const value = Number(storeSettings.leftoverCommissionValue) || 0;
              commissionAmount =
                mode === 'percent'
                  ? Math.round(data.lineCalc.lineTotal * value) / 100
                  : value * data.quantity;
            }
          }

          const saleItem = saleItemRepo.create({
            saleId: savedSale.id,
            variantId: data.variant.id,
            productName: data.variant.product.name,
            variantSku: data.variant.sku,
            variantSize: data.variant.size,
            variantColor: data.variant.color,
            quantity: data.quantity,
            unitPrice: data.lineCalc.unitPrice,
            discountPercent: data.discountPercent,
            taxRate: data.lineCalc.taxRate,
            taxAmount: data.lineCalc.taxAmount,
            lineTotal: data.lineCalc.lineTotal,
            isLeftover,
            commissionAmount,
            tenantId,
          });
          await saleItemRepo.save(saleItem);

          // Deduct inventory — cascade: primary warehouse first, then others by qty desc
          let remaining = data.quantity;
          for (const stock of data.stocks) {
            if (remaining <= 0) break;
            const available = Number(stock.quantity);
            if (available <= 0) continue;

            const toDeduct = Math.min(available, remaining);
            stock.quantity = available - toDeduct;
            remaining -= toDeduct;

            await stockRepo.save(stock);

            const movement = movementRepo.create({
              variantId: data.variant.id,
              warehouseId: stock.warehouseId,
              movementType: MovementType.OUT,
              quantity: -toDeduct,
              referenceType: 'SALE',
              referenceId: savedSale.id,
              notes: `Venta ${saleNumber}`,
              createdById: userId,
              tenantId,
            });
            await movementRepo.save(movement);
          }

          // Perfumería: si el producto (loción) tiene un frasco vinculado,
          // descontar 1 frasco por cada unidad vendida. NO bloquea la venta:
          // descuenta lo disponible y el remanente deja el frasco en negativo
          // (aviso de que hay que reponer).
          const frascoVariantId = data.variant.product.frascoVariantId;
          if (frascoVariantId) {
            const frascoStocks = await stockRepo.find({
              where: { variantId: frascoVariantId, tenantId },
              order: { quantity: 'DESC' },
            });
            let frascoRemaining = data.quantity;
            for (
              let i = 0;
              i < frascoStocks.length && frascoRemaining > 0;
              i++
            ) {
              const fs = frascoStocks[i];
              const isLast = i === frascoStocks.length - 1;
              const avail = Number(fs.quantity);
              // En la última fila se descuenta todo el remanente (puede quedar
              // negativo); en las demás, solo lo positivo disponible.
              const toDeduct = isLast
                ? frascoRemaining
                : Math.min(Math.max(avail, 0), frascoRemaining);
              if (toDeduct <= 0) continue;
              fs.quantity = avail - toDeduct;
              frascoRemaining -= toDeduct;
              await stockRepo.save(fs);
              await movementRepo.save(
                movementRepo.create({
                  variantId: frascoVariantId,
                  warehouseId: fs.warehouseId,
                  movementType: MovementType.OUT,
                  quantity: -toDeduct,
                  referenceType: 'SALE',
                  referenceId: savedSale.id,
                  notes: `Frasco por venta ${saleNumber}`,
                  createdById: userId,
                  tenantId,
                }),
              );
            }
          }

          // Separados (F6): al venderle al cliente que tenía el apartado, se
          // consume su reserva (FULFILLED cuando se agota), liberando el control.
          if (reservationsEnabled && clientId) {
            let toConsume = data.quantity;
            const clientResv = activeReservations
              .filter(
                (r) =>
                  r.variantId === data.variant.id &&
                  r.clientId === clientId &&
                  r.status === 'ACTIVE',
              )
              .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
            for (const r of clientResv) {
              if (toConsume <= 0) break;
              const take = Math.min(Number(r.quantity), toConsume);
              r.quantity = Number(r.quantity) - take;
              toConsume -= take;
              if (r.quantity <= 0) r.status = 'FULFILLED';
              await reservationRepo.save(r);
            }
          }
        }

        // Create payments (only regular, not credit). Si la venta queda pendiente
        // de pago, no se registra ningún pago (se hará al marcarla como pagada).
        for (const p of isPending ? [] : regularPayments) {
          const receivedAmount = p.receivedAmount ?? p.amount;
          const changeAmount =
            p.method === PaymentMethod.EFECTIVO
              ? Math.max(0, receivedAmount - p.amount)
              : 0;

          const payment = paymentRepo.create({
            saleId: savedSale.id,
            method: p.method,
            amount: p.amount,
            reference: p.reference,
            bankId: p.bankId ?? null,
            receiptImageUrl: p.receiptImageUrl,
            receivedAmount,
            changeAmount,
            tenantId,
          });
          await paymentRepo.save(payment);
        }

        // Create accounts receivable if credit
        if (totalCredit > 0) {
          const arRepo = manager.getRepository(AccountsReceivable);
          const ar = arRepo.create({
            saleId: savedSale.id,
            clientId: clientId!,
            totalAmount: totalCredit,
            paidAmount: 0,
            dueDate: new Date(dto.creditDueDate!),
            notes: dto.creditNotes,
            tenantId,
          });
          await arRepo.save(ar);
        }

        // Return full sale with relations using transaction manager
        const fullSale = await saleRepo.findOne({
          where: { id: savedSale.id, tenantId },
          relations: [
            'client',
            'user',
            'warehouse',
            'items',
            'items.variant',
            'payments',
          ],
        });
        if (!fullSale) {
          throw new NotFoundException('Venta no encontrada después de crear');
        }
        return fullSale;
      }),
    );

    // Send invoice email asynchronously (fire-and-forget)
    if (fullSale.client?.email) {
      const settings = await this.storeSettingsRepo.findOne({
        where: { tenantId },
      });
      this.invoiceEmailService
        .sendInvoice(tenantId, {
          invoiceNumber: fullSale.invoiceNumber,
          orderNumber: fullSale.saleNumber,
          storeName: settings?.storeName || 'MiPinta',
          customerName: `${fullSale.client.firstName} ${fullSale.client.lastName}`,
          customerEmail: fullSale.client.email,
          items: fullSale.items.map((i) => ({
            productName: i.productName,
            variantInfo: `${i.variantSize} / ${i.variantColor}`,
            quantity: i.quantity,
            unitPrice: Number(i.unitPrice),
            lineTotal: Number(i.lineTotal),
          })),
          subtotal: Number(fullSale.subtotal),
          discountAmount: Number(fullSale.discountAmount),
          taxAmount: Number(fullSale.taxAmount),
          total: Number(fullSale.total),
          paymentMethod: fullSale.payments?.[0]?.method,
          date: fullSale.createdAt,
        })
        .catch(() => {});
    }

    return fullSale;
  }

  async sendSaleInvoice(
    saleId: string,
    email: string,
    tenantId: string,
  ): Promise<{ success: boolean; error?: string }> {
    const sale = await this.findOne(saleId, tenantId);
    const settings = await this.storeSettingsRepo.findOne({
      where: { tenantId },
    });

    const result = await this.invoiceEmailService.sendInvoice(tenantId, {
      invoiceNumber: sale.invoiceNumber,
      orderNumber: sale.saleNumber,
      storeName: settings?.storeName || 'MiPinta',
      customerName: sale.client
        ? `${sale.client.firstName} ${sale.client.lastName}`
        : 'Consumidor Final',
      customerEmail: email,
      items: sale.items.map((i) => ({
        productName: i.productName,
        variantInfo: `${i.variantSize} / ${i.variantColor}`,
        quantity: i.quantity,
        unitPrice: Number(i.unitPrice),
        lineTotal: Number(i.lineTotal),
      })),
      subtotal: Number(sale.subtotal),
      discountAmount: Number(sale.discountAmount),
      taxAmount: Number(sale.taxAmount),
      total: Number(sale.total),
      paymentMethod: sale.payments?.[0]?.method,
      date: sale.createdAt,
    });

    return result;
  }

  // Determina si un producto es "punta" (F2): override manual si está definido;
  // si no, criterio automático (antigüedad ≥ meses Y ≤ tallas restantes con stock).
  private async isProductLeftover(
    manager: import('typeorm').EntityManager,
    product: { id: string; isLeftover?: boolean | null; createdAt: Date },
    settings: StoreSettings,
    tenantId: string,
  ): Promise<boolean> {
    if (product.isLeftover !== null && product.isLeftover !== undefined) {
      return product.isLeftover;
    }
    const now = new Date();
    const created = new Date(product.createdAt);
    const ageMonths =
      (now.getFullYear() - created.getFullYear()) * 12 +
      (now.getMonth() - created.getMonth());
    if (ageMonths < Number(settings.leftoverAgeMonths ?? 8)) return false;

    const raw = await manager
      .getRepository(Stock)
      .createQueryBuilder('s')
      .innerJoin('product_variants', 'pv', 'pv.id = s.variant_id')
      .where('pv.product_id = :pid', { pid: product.id })
      .andWhere('s.tenant_id = :t', { t: tenantId })
      .andWhere('s.quantity > 0')
      .select('COUNT(DISTINCT pv.size)', 'cnt')
      .getRawOne<{ cnt: string }>();
    const remainingSizes = Number(raw?.cnt ?? 0);
    return remainingSizes <= Number(settings.leftoverMaxSizes ?? 2);
  }

  async findAll(
    filters:
      | {
          status?: SaleStatus;
          warehouseId?: string;
          userId?: string;
          from?: string;
          to?: string;
          limit?: number;
          saleChannel?: string;
          paid?: boolean;
          clientPhone?: string;
        }
      | undefined,
    tenantId: string,
  ): Promise<Sale[]> {
    const where: Record<string, unknown> = { tenantId };
    if (filters?.status) where.status = filters.status;
    if (filters?.warehouseId) where.warehouseId = filters.warehouseId;
    if (filters?.userId) where.userId = filters.userId;
    if (filters?.saleChannel) where.saleChannel = filters.saleChannel;
    if (filters?.paid !== undefined) where.isPaid = filters.paid;
    // Buscar venta por teléfono del cliente (para recuperar una venta cuando
    // solo se tiene el número de WhatsApp).
    if (filters?.clientPhone?.trim()) {
      where.client = { phone: ILike(`%${filters.clientPhone.trim()}%`) };
    }

    return this.saleRepository.find({
      where,
      relations: [
        'client',
        'user',
        'warehouse',
        'items',
        'payments',
        'accountsReceivable',
      ],
      order: { createdAt: 'DESC' },
      take: filters?.limit || 100,
    });
  }

  async findOne(id: string, tenantId: string): Promise<Sale> {
    const sale = await this.saleRepository.findOne({
      where: { id, tenantId },
      relations: [
        'client',
        'user',
        'warehouse',
        'items',
        'items.variant',
        'payments',
      ],
    });
    if (!sale) {
      throw new NotFoundException('Venta no encontrada');
    }
    return sale;
  }

  // Edita propiedades de una venta (sin tocar ítems/inventario). Recalcula el
  // total si cambia el descuento y sincroniza la cuenta por cobrar si aplica.
  async updateSale(
    id: string,
    dto: {
      clientId?: string | null;
      invoiceNumber?: string;
      notes?: string;
      saleChannel?: SaleChannel;
      saleDate?: string;
      discountAmount?: number;
      items?: { variantId: string; quantity: number }[];
    },
    userId: string,
    tenantId: string,
  ): Promise<Sale> {
    await this.dataSource.transaction(async (manager) => {
      const saleRepo = manager.getRepository(Sale);
      const sale = await saleRepo.findOne({
        where: { id, tenantId },
        relations: ['accountsReceivable'],
      });
      if (!sale) throw new NotFoundException('Venta no encontrada');
      if (sale.status === SaleStatus.CANCELLED) {
        throw new BadRequestException('No se puede editar una venta cancelada');
      }

      if (dto.clientId !== undefined) {
        sale.clientId = (dto.clientId ?? null) as unknown as string;
      }
      if (dto.notes !== undefined) sale.notes = dto.notes;
      if (dto.saleChannel !== undefined) sale.saleChannel = dto.saleChannel;
      if (dto.saleDate) {
        // Fecha sola (YYYY-MM-DD) -> mediodía, para que no corra al día
        // anterior por zona horaria (el servidor está en UTC).
        const iso = /^\d{4}-\d{2}-\d{2}$/.test(dto.saleDate)
          ? `${dto.saleDate}T12:00:00`
          : dto.saleDate;
        sale.createdAt = new Date(iso);
      }

      if (dto.invoiceNumber !== undefined) {
        const dup = await saleRepo.findOne({
          where: { tenantId, invoiceNumber: dto.invoiceNumber },
        });
        if (dup && dup.id !== sale.id) {
          throw new BadRequestException(
            `Ya existe una venta con la factura ${dto.invoiceNumber}`,
          );
        }
        sale.invoiceNumber = dto.invoiceNumber;
      }

      const discount =
        dto.discountAmount !== undefined
          ? dto.discountAmount
          : Number(sale.discountAmount);

      if (dto.items) {
        if (dto.items.length === 0) {
          throw new BadRequestException('La venta debe tener al menos un ítem');
        }
        const stockRepo = manager.getRepository(Stock);
        const movementRepo = manager.getRepository(StockMovement);
        const saleItemRepo = manager.getRepository(SaleItem);
        const variantRepo = manager.getRepository(ProductVariant);

        // Proporción de IVA de la venta original (para conservar su régimen).
        const origSubtotal = Number(sale.subtotal) || 0;
        const taxRatio =
          origSubtotal > 0 ? Number(sale.taxAmount) / origSubtotal : 0;

        // 1) Revertir inventario de los ítems previos (soporta frasco/cascada).
        const prevMovs = await movementRepo.find({
          where: { referenceType: 'SALE', referenceId: sale.id, tenantId },
        });
        for (const m of prevMovs) {
          const st = await stockRepo.findOne({
            where: {
              variantId: m.variantId,
              warehouseId: m.warehouseId,
              tenantId,
            },
          });
          if (st) {
            st.quantity += Math.abs(Number(m.quantity));
            await stockRepo.save(st);
          }
        }
        await movementRepo.delete({
          referenceType: 'SALE',
          referenceId: sale.id,
          tenantId,
        });
        await saleItemRepo.delete({ saleId: sale.id, tenantId });

        // 2) Aplicar los ítems nuevos (mismo patrón que createSale).
        let newSubtotal = 0;
        for (const item of dto.items) {
          const variant = await variantRepo.findOne({
            where: { id: item.variantId },
            relations: ['product'],
          });
          if (!variant || variant.tenantId !== tenantId) {
            throw new NotFoundException(
              `Variante ${item.variantId} no encontrada`,
            );
          }
          const itemStocks = await stockRepo.find({
            where: { variantId: item.variantId, tenantId },
          });
          itemStocks.sort((a, b) => {
            if (a.warehouseId === sale.warehouseId) return -1;
            if (b.warehouseId === sale.warehouseId) return 1;
            return Number(b.quantity) - Number(a.quantity);
          });
          const totalAvailable = itemStocks.reduce(
            (s, st) => s + Number(st.quantity),
            0,
          );
          if (totalAvailable < item.quantity) {
            throw new BadRequestException(
              `Stock insuficiente para "${variant.product.name}" ${variant.size}/${variant.color}. ` +
                `Disponible total: ${totalAvailable}, Solicitado: ${item.quantity}`,
            );
          }

          const unitPrice = variant.priceOverride
            ? Number(variant.priceOverride)
            : Number(variant.product.basePrice);
          const lineTotal = unitPrice * item.quantity;
          newSubtotal += lineTotal;

          await saleItemRepo.save(
            saleItemRepo.create({
              saleId: sale.id,
              variantId: variant.id,
              productName: variant.product.name,
              variantSku: variant.sku,
              variantSize: variant.size,
              variantColor: variant.color,
              quantity: item.quantity,
              unitPrice,
              discountPercent: 0,
              taxRate: 0,
              taxAmount: 0,
              lineTotal,
              tenantId,
            }),
          );

          // Descontar inventario en cascada (bodega de la venta primero).
          let remaining = item.quantity;
          for (const stock of itemStocks) {
            if (remaining <= 0) break;
            const available = Number(stock.quantity);
            if (available <= 0) continue;
            const toDeduct = Math.min(available, remaining);
            stock.quantity = available - toDeduct;
            remaining -= toDeduct;
            await stockRepo.save(stock);
            await movementRepo.save(
              movementRepo.create({
                variantId: variant.id,
                warehouseId: stock.warehouseId,
                movementType: MovementType.OUT,
                quantity: -toDeduct,
                referenceType: 'SALE',
                referenceId: sale.id,
                notes: `Edición venta ${sale.saleNumber}`,
                createdById: userId,
                tenantId,
              }),
            );
          }

          // Perfumería: descontar 1 frasco por unidad si el producto lo tiene.
          const frascoVariantId = variant.product.frascoVariantId;
          if (frascoVariantId) {
            const frascoStocks = await stockRepo.find({
              where: { variantId: frascoVariantId, tenantId },
              order: { quantity: 'DESC' },
            });
            let frascoRemaining = item.quantity;
            for (
              let i = 0;
              i < frascoStocks.length && frascoRemaining > 0;
              i++
            ) {
              const fs = frascoStocks[i];
              const isLast = i === frascoStocks.length - 1;
              const avail = Number(fs.quantity);
              const toDeduct = isLast
                ? frascoRemaining
                : Math.min(Math.max(avail, 0), frascoRemaining);
              if (toDeduct <= 0) continue;
              fs.quantity = avail - toDeduct;
              frascoRemaining -= toDeduct;
              await stockRepo.save(fs);
              await movementRepo.save(
                movementRepo.create({
                  variantId: frascoVariantId,
                  warehouseId: fs.warehouseId,
                  movementType: MovementType.OUT,
                  quantity: -toDeduct,
                  referenceType: 'SALE',
                  referenceId: sale.id,
                  notes: `Frasco por edición venta ${sale.saleNumber}`,
                  createdById: userId,
                  tenantId,
                }),
              );
            }
          }
        }

        const newTax = Math.round(newSubtotal * taxRatio);
        sale.subtotal = newSubtotal;
        sale.taxAmount = newTax;
        sale.discountAmount = discount;
        sale.total = Math.max(0, newSubtotal - discount + newTax);
      } else if (dto.discountAmount !== undefined) {
        const subtotal = Number(sale.subtotal);
        const tax = Number(sale.taxAmount);
        sale.discountAmount = dto.discountAmount;
        sale.total = Math.max(0, subtotal - dto.discountAmount + tax);
      }

      await saleRepo.save(sale);

      // Sincronizar CxC (crédito) no pagada por completo con el nuevo total.
      const ar = (sale.accountsReceivable || []).find((a) => !a.isFullyPaid);
      if (ar) {
        ar.totalAmount = sale.total;
        await manager.getRepository(AccountsReceivable).save(ar);
      }
    });
    return this.findOne(id, tenantId);
  }

  async getReceipt(id: string, tenantId: string): Promise<ReceiptData> {
    const sale = await this.findOne(id, tenantId);
    return this.receiptService.generateReceipt(sale);
  }

  // Marca como pagada una venta pendiente (no-crédito), registrando el pago
  // (método, banco, recibo, foto). Suma el total al banco vía Payment.bankId.
  async markSalePaid(
    id: string,
    dto: {
      method: PaymentMethod;
      bankId?: string;
      reference?: string;
      receiptImageUrl?: string;
    },
    tenantId: string,
  ): Promise<Sale> {
    await this.dataSource.transaction(async (manager) => {
      const saleRepo = manager.getRepository(Sale);
      const sale = await saleRepo.findOne({ where: { id, tenantId } });
      if (!sale) throw new NotFoundException('Venta no encontrada');
      if (sale.status !== SaleStatus.COMPLETED) {
        throw new BadRequestException('La venta no está activa');
      }
      if (sale.isPaid) {
        throw new BadRequestException('La venta ya está pagada');
      }
      if (dto.method === PaymentMethod.CREDITO) {
        throw new BadRequestException('Método de pago inválido');
      }

      const total = Number(sale.total);
      await manager.getRepository(Payment).save(
        manager.getRepository(Payment).create({
          saleId: sale.id,
          method: dto.method,
          amount: total,
          reference: dto.reference,
          bankId: dto.bankId ?? null,
          receiptImageUrl: dto.receiptImageUrl,
          receivedAmount: total,
          changeAmount: 0,
          tenantId,
        }),
      );

      sale.isPaid = true;
      await saleRepo.save(sale);
    });
    // Leer fuera de la transacción para devolver el estado ya confirmado.
    return this.findOne(id, tenantId);
  }

  async cancelSale(
    id: string,
    userId: string,
    tenantId: string,
  ): Promise<Sale> {
    return this.dataSource.transaction(async (manager) => {
      const saleRepo = manager.getRepository(Sale);
      const stockRepo = manager.getRepository(Stock);
      const movementRepo = manager.getRepository(StockMovement);

      const sale = await saleRepo.findOne({
        where: { id, tenantId },
        relations: ['items'],
      });

      if (!sale) {
        throw new NotFoundException('Venta no encontrada');
      }
      if (sale.status !== SaleStatus.COMPLETED) {
        throw new BadRequestException(
          'Solo se pueden cancelar ventas completadas',
        );
      }

      // Restore inventory — reverse actual movements (supports cascade deductions)
      const saleMovements = await movementRepo.find({
        where: {
          referenceType: 'SALE',
          referenceId: sale.id,
          tenantId,
        },
      });

      for (const mov of saleMovements) {
        const stock = await stockRepo.findOne({
          where: {
            variantId: mov.variantId,
            warehouseId: mov.warehouseId,
            tenantId,
          },
        });
        if (stock) {
          stock.quantity += Math.abs(Number(mov.quantity));
          await stockRepo.save(stock);
        }

        const reversal = movementRepo.create({
          variantId: mov.variantId,
          warehouseId: mov.warehouseId,
          movementType: MovementType.IN,
          quantity: Math.abs(Number(mov.quantity)),
          referenceType: 'SALE_CANCEL',
          referenceId: sale.id,
          notes: `Cancelación venta ${sale.saleNumber}`,
          createdById: userId,
          tenantId,
        });
        await movementRepo.save(reversal);
      }

      sale.status = SaleStatus.CANCELLED;
      await saleRepo.save(sale);

      return this.findOne(id, tenantId);
    });
  }

  async getDailySummary(
    warehouseId: string | undefined,
    tenantId: string,
  ): Promise<{
    totalSales: number;
    totalAmount: number;
    totalItems: number;
    byPaymentMethod: Record<string, number>;
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const qb = this.saleRepository
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.items', 'items')
      .leftJoinAndSelect('s.payments', 'payments')
      .leftJoinAndSelect('s.accountsReceivable', 'ar')
      .where('s.status = :status', { status: SaleStatus.COMPLETED })
      .andWhere('s.created_at >= :today', { today: today.toISOString() })
      .andWhere('s.tenant_id = :tenantId', { tenantId });

    if (warehouseId) {
      qb.andWhere('s.warehouse_id = :wid', { wid: warehouseId });
    }

    const sales = await qb.getMany();

    const totalSales = sales.length;
    const totalAmount = sales.reduce((sum, s) => sum + Number(s.total), 0);
    const totalItems = sales.reduce(
      (sum, s) => sum + s.items.reduce((iSum, i) => iSum + i.quantity, 0),
      0,
    );

    const byPaymentMethod: Record<string, number> = {};
    for (const sale of sales) {
      for (const payment of sale.payments) {
        byPaymentMethod[payment.method] =
          (byPaymentMethod[payment.method] || 0) + Number(payment.amount);
      }
      if (sale.accountsReceivable) {
        for (const ar of sale.accountsReceivable) {
          byPaymentMethod['CREDITO'] =
            (byPaymentMethod['CREDITO'] || 0) + Number(ar.totalAmount);
        }
      }
    }

    return { totalSales, totalAmount, totalItems, byPaymentMethod };
  }

  // ─── Accounts Receivable ───

  async findAllAccountsReceivable(
    filters:
      | {
          isFullyPaid?: boolean;
          clientId?: string;
        }
      | undefined,
    tenantId: string,
  ): Promise<AccountsReceivable[]> {
    const where: Record<string, unknown> = { tenantId };
    if (filters?.isFullyPaid !== undefined)
      where.isFullyPaid = filters.isFullyPaid;
    if (filters?.clientId) where.clientId = filters.clientId;

    return this.arRepository.find({
      where,
      relations: ['sale', 'client', 'payments'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOneAccountReceivable(
    id: string,
    tenantId: string,
  ): Promise<AccountsReceivable> {
    const ar = await this.arRepository.findOne({
      where: { id, tenantId },
      relations: ['sale', 'client', 'payments'],
    });
    if (!ar) {
      throw new NotFoundException('Cuenta por cobrar no encontrada');
    }
    return ar;
  }

  async recordArPayment(
    arId: string,
    dto: RecordArPaymentDto,
    tenantId: string,
  ): Promise<AccountsReceivable> {
    return this.dataSource.transaction(async (manager) => {
      const arRepo = manager.getRepository(AccountsReceivable);
      const arPayRepo = manager.getRepository(AccountsReceivablePayment);

      const ar = await arRepo.findOne({
        where: { id: arId, tenantId },
        relations: ['payments'],
      });
      if (!ar) {
        throw new NotFoundException('Cuenta por cobrar no encontrada');
      }
      if (ar.isFullyPaid) {
        throw new BadRequestException(
          'Esta cuenta ya está completamente pagada',
        );
      }

      const pending = Number(ar.totalAmount) - Number(ar.paidAmount);
      if (dto.amount > pending) {
        throw new BadRequestException(
          `El monto ($${dto.amount}) excede el saldo pendiente ($${pending.toFixed(2)})`,
        );
      }

      // Create payment record
      const payment = arPayRepo.create({
        accountReceivableId: arId,
        amount: dto.amount,
        method: dto.method,
        reference: dto.reference,
        bankId: dto.bankId ?? null,
        receiptImageUrl: dto.receiptImageUrl,
        notes: dto.notes,
        tenantId,
      });
      await arPayRepo.save(payment);

      // Update totals (use update() to avoid TypeORM cascade issues with loaded relations)
      const newPaidAmount = Number(ar.paidAmount) + dto.amount;
      const isFullyPaid = newPaidAmount >= Number(ar.totalAmount);
      await arRepo.update(
        { id: arId, tenantId },
        {
          paidAmount: newPaidAmount,
          ...(isFullyPaid
            ? { isFullyPaid: true, fullyPaidAt: new Date() }
            : {}),
        },
      );

      // Return with relations
      const updated = await arRepo.findOne({
        where: { id: arId, tenantId },
        relations: ['sale', 'client', 'payments'],
      });
      return updated!;
    });
  }

  async getClientAccountSummary(
    clientId: string,
    tenantId: string,
  ): Promise<{
    totalCredit: number;
    totalPaid: number;
    totalPending: number;
    activeAccounts: number;
  }> {
    const accounts = await this.arRepository.find({
      where: { clientId, tenantId },
    });

    const totalCredit = accounts.reduce(
      (sum, a) => sum + Number(a.totalAmount),
      0,
    );
    const totalPaid = accounts.reduce(
      (sum, a) => sum + Number(a.paidAmount),
      0,
    );

    return {
      totalCredit,
      totalPaid,
      totalPending: totalCredit - totalPaid,
      activeAccounts: accounts.filter((a) => !a.isFullyPaid).length,
    };
  }

  /**
   * Estado de cuenta de un cliente: sus ventas a crédito (facturas) con lo que
   * compró, cuánto ha abonado y cuánto debe. Reúne en una sola vista lo que
   * antes obligaba a cruzar Ventas ↔ Cuentas por Cobrar. Genérico para todos
   * los tenants.
   */
  async getClientStatement(clientId: string, tenantId: string) {
    const accounts = await this.arRepository.find({
      where: { clientId, tenantId },
      relations: ['sale', 'sale.items', 'client', 'payments'],
      order: { createdAt: 'DESC' },
    });

    let totalCredit = 0;
    let totalPaid = 0;
    let totalDebt = 0;

    const client = accounts[0]?.client;

    const invoices = accounts.map((ar) => {
      const total = Number(ar.totalAmount);
      const paid = Number(ar.paidAmount);
      const balance = Math.max(0, total - paid);
      const paymentStatus =
        ar.isFullyPaid || balance <= 0
          ? 'PAID'
          : paid > 0
            ? 'PARTIAL'
            : 'PENDING';

      totalCredit += total;
      totalPaid += paid;
      totalDebt += balance;

      return {
        id: ar.id,
        saleId: ar.saleId,
        invoiceNumber: ar.sale?.invoiceNumber ?? ar.sale?.saleNumber ?? null,
        date: ar.createdAt,
        dueDate: ar.dueDate ?? null,
        subtotal: ar.sale ? Number(ar.sale.subtotal) : total,
        discountAmount: ar.sale ? Number(ar.sale.discountAmount) : 0,
        taxAmount: ar.sale ? Number(ar.sale.taxAmount) : 0,
        total,
        paidAmount: paid,
        balance,
        paymentStatus,
        items: (ar.sale?.items || []).map((it) => ({
          name: it.productName,
          size: it.variantSize ?? '',
          color: it.variantColor ?? '',
          quantity: it.quantity,
          unitPrice: Number(it.unitPrice),
          lineTotal: it.quantity * Number(it.unitPrice),
        })),
      };
    });

    return {
      client: client
        ? {
            id: client.id,
            name: `${client.firstName ?? ''} ${client.lastName ?? ''}`.trim(),
            documentNumber: client.documentNumber ?? null,
            phone: client.phone ?? null,
            email: client.email ?? null,
            address: client.address ?? null,
          }
        : null,
      invoices,
      totals: { totalCredit, totalPaid, totalDebt },
    };
  }
}
