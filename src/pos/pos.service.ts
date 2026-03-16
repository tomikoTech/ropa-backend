import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
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
import { SaleStatus } from '../common/enums/sale-status.enum.js';
import { PaymentMethod } from '../common/enums/payment-method.enum.js';
import { MovementType } from '../common/enums/movement-type.enum.js';

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
    const fullSale = await this.dataSource.transaction(async (manager) => {
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
        if (totalAvailable < item.quantity) {
          throw new BadRequestException(
            `Stock insuficiente para "${variant.product.name}" ${variant.size}/${variant.color}. ` +
              `Disponible total: ${totalAvailable}, Solicitado: ${item.quantity}`,
          );
        }

        const unitPrice = variant.priceOverride
          ? Number(variant.priceOverride)
          : Number(variant.product.basePrice);
        const taxRate = Number(variant.product.taxRate);
        const discountPercent = item.discountPercent || 0;

        const lineCalc = this.taxService.calculateLine(
          unitPrice,
          item.quantity,
          discountPercent,
          taxRate,
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
      const totalCredit = creditPayments.reduce((sum, p) => sum + p.amount, 0);

      if (totalRegular + totalCredit < saleTotals.total) {
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
      const saleNumber = await this.invoiceService.generateSaleNumber(tenantId);
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
        notes: dto.notes,
        tenantId,
      });
      const savedSale = await saleRepo.save(sale);

      // Create sale items
      for (const data of variantData) {
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
      }

      // Create payments (only regular, not credit)
      for (const p of regularPayments) {
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
    });

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

  async findAll(
    filters:
      | {
          status?: SaleStatus;
          warehouseId?: string;
          userId?: string;
          from?: string;
          to?: string;
          limit?: number;
        }
      | undefined,
    tenantId: string,
  ): Promise<Sale[]> {
    const where: Record<string, unknown> = { tenantId };
    if (filters?.status) where.status = filters.status;
    if (filters?.warehouseId) where.warehouseId = filters.warehouseId;
    if (filters?.userId) where.userId = filters.userId;

    return this.saleRepository.find({
      where,
      relations: ['client', 'user', 'warehouse', 'items', 'payments'],
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

  async getReceipt(id: string, tenantId: string): Promise<ReceiptData> {
    const sale = await this.findOne(id, tenantId);
    return this.receiptService.generateReceipt(sale);
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
}
