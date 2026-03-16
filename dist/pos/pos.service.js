"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PosService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const sale_entity_js_1 = require("./entities/sale.entity.js");
const sale_item_entity_js_1 = require("./entities/sale-item.entity.js");
const payment_entity_js_1 = require("./entities/payment.entity.js");
const product_variant_entity_js_1 = require("../products/entities/product-variant.entity.js");
const stock_entity_js_1 = require("../inventory/entities/stock.entity.js");
const stock_movement_entity_js_1 = require("../inventory/entities/stock-movement.entity.js");
const client_entity_js_1 = require("../clients/entities/client.entity.js");
const accounts_receivable_entity_js_1 = require("./entities/accounts-receivable.entity.js");
const accounts_receivable_payment_entity_js_1 = require("./entities/accounts-receivable-payment.entity.js");
const tax_service_js_1 = require("./services/tax.service.js");
const invoice_service_js_1 = require("./services/invoice.service.js");
const product_status_enum_js_1 = require("../common/enums/product-status.enum.js");
const receipt_service_js_1 = require("./services/receipt.service.js");
const invoice_email_service_js_1 = require("../common/services/invoice-email.service.js");
const store_settings_entity_js_1 = require("../storefront/entities/store-settings.entity.js");
const sale_status_enum_js_1 = require("../common/enums/sale-status.enum.js");
const payment_method_enum_js_1 = require("../common/enums/payment-method.enum.js");
const movement_type_enum_js_1 = require("../common/enums/movement-type.enum.js");
let PosService = class PosService {
    saleRepository;
    saleItemRepository;
    paymentRepository;
    arRepository;
    arPaymentRepository;
    variantRepository;
    stockRepository;
    storeSettingsRepo;
    dataSource;
    taxService;
    invoiceService;
    receiptService;
    invoiceEmailService;
    constructor(saleRepository, saleItemRepository, paymentRepository, arRepository, arPaymentRepository, variantRepository, stockRepository, storeSettingsRepo, dataSource, taxService, invoiceService, receiptService, invoiceEmailService) {
        this.saleRepository = saleRepository;
        this.saleItemRepository = saleItemRepository;
        this.paymentRepository = paymentRepository;
        this.arRepository = arRepository;
        this.arPaymentRepository = arPaymentRepository;
        this.variantRepository = variantRepository;
        this.stockRepository = stockRepository;
        this.storeSettingsRepo = storeSettingsRepo;
        this.dataSource = dataSource;
        this.taxService = taxService;
        this.invoiceService = invoiceService;
        this.receiptService = receiptService;
        this.invoiceEmailService = invoiceEmailService;
    }
    async createSale(dto, userId, tenantId) {
        const fullSale = await this.dataSource.transaction(async (manager) => {
            const variantRepo = manager.getRepository(product_variant_entity_js_1.ProductVariant);
            const stockRepo = manager.getRepository(stock_entity_js_1.Stock);
            const movementRepo = manager.getRepository(stock_movement_entity_js_1.StockMovement);
            const saleRepo = manager.getRepository(sale_entity_js_1.Sale);
            const saleItemRepo = manager.getRepository(sale_item_entity_js_1.SaleItem);
            const paymentRepo = manager.getRepository(payment_entity_js_1.Payment);
            let clientId = dto.clientId;
            if (!clientId) {
                const generic = await manager.getRepository(client_entity_js_1.Client).findOne({
                    where: { isGeneric: true, tenantId },
                });
                if (generic) {
                    clientId = generic.id;
                }
            }
            else {
                const client = await manager.getRepository(client_entity_js_1.Client).findOne({
                    where: { id: dto.clientId, tenantId },
                });
                if (!client) {
                    throw new common_1.NotFoundException('Cliente no encontrado');
                }
            }
            const lineCalcs = [];
            const variantData = [];
            const allVariantIds = dto.items.map((i) => i.variantId);
            const allStocks = await stockRepo.find({
                where: { variantId: (0, typeorm_2.In)(allVariantIds), tenantId },
            });
            const stocksByVariant = new Map();
            for (const s of allStocks) {
                const arr = stocksByVariant.get(s.variantId);
                if (arr)
                    arr.push(s);
                else
                    stocksByVariant.set(s.variantId, [s]);
            }
            for (const item of dto.items) {
                const variant = await variantRepo.findOne({
                    where: { id: item.variantId },
                    relations: ['product'],
                });
                if (!variant) {
                    throw new common_1.NotFoundException(`Variante ${item.variantId} no encontrada`);
                }
                if (variant.tenantId !== tenantId) {
                    throw new common_1.NotFoundException(`Variante ${item.variantId} no encontrada`);
                }
                if (!variant.isActive ||
                    variant.product.status !== product_status_enum_js_1.ProductStatus.ACTIVE) {
                    throw new common_1.BadRequestException(`Producto "${variant.product.name}" (${variant.sku}) no está activo`);
                }
                const itemStocks = stocksByVariant.get(item.variantId) || [];
                itemStocks.sort((a, b) => {
                    if (a.warehouseId === dto.warehouseId)
                        return -1;
                    if (b.warehouseId === dto.warehouseId)
                        return 1;
                    return Number(b.quantity) - Number(a.quantity);
                });
                const totalAvailable = itemStocks.reduce((sum, s) => sum + Number(s.quantity), 0);
                if (totalAvailable < item.quantity) {
                    throw new common_1.BadRequestException(`Stock insuficiente para "${variant.product.name}" ${variant.size}/${variant.color}. ` +
                        `Disponible total: ${totalAvailable}, Solicitado: ${item.quantity}`);
                }
                const unitPrice = variant.priceOverride
                    ? Number(variant.priceOverride)
                    : Number(variant.product.basePrice);
                const taxRate = Number(variant.product.taxRate);
                const discountPercent = item.discountPercent || 0;
                const lineCalc = this.taxService.calculateLine(unitPrice, item.quantity, discountPercent, taxRate);
                lineCalcs.push(lineCalc);
                variantData.push({
                    variant,
                    stocks: itemStocks,
                    quantity: item.quantity,
                    discountPercent,
                    lineCalc,
                });
            }
            const saleTotals = this.taxService.calculateSaleTotals(lineCalcs);
            const regularPayments = dto.payments.filter((p) => p.method !== payment_method_enum_js_1.PaymentMethod.CREDITO);
            const creditPayments = dto.payments.filter((p) => p.method === payment_method_enum_js_1.PaymentMethod.CREDITO);
            const totalRegular = regularPayments.reduce((sum, p) => sum + p.amount, 0);
            const totalCredit = creditPayments.reduce((sum, p) => sum + p.amount, 0);
            if (totalRegular + totalCredit < saleTotals.total) {
                throw new common_1.BadRequestException(`Pago insuficiente. Total: $${saleTotals.total}, Pagado: $${totalRegular + totalCredit}`);
            }
            if (totalCredit > 0) {
                const client = clientId
                    ? await manager
                        .getRepository(client_entity_js_1.Client)
                        .findOne({ where: { id: clientId, tenantId } })
                    : null;
                if (!client || client.isGeneric) {
                    throw new common_1.BadRequestException('Las ventas a crédito requieren un cliente registrado (no genérico)');
                }
                if (!dto.creditDueDate) {
                    throw new common_1.BadRequestException('Las ventas a crédito requieren fecha de vencimiento');
                }
            }
            const saleNumber = await this.invoiceService.generateSaleNumber(tenantId);
            const invoiceNumber = await this.invoiceService.generateInvoiceNumber(tenantId);
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
                status: sale_status_enum_js_1.SaleStatus.COMPLETED,
                notes: dto.notes,
                tenantId,
            });
            const savedSale = await saleRepo.save(sale);
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
                let remaining = data.quantity;
                for (const stock of data.stocks) {
                    if (remaining <= 0)
                        break;
                    const available = Number(stock.quantity);
                    if (available <= 0)
                        continue;
                    const toDeduct = Math.min(available, remaining);
                    stock.quantity = available - toDeduct;
                    remaining -= toDeduct;
                    await stockRepo.save(stock);
                    const movement = movementRepo.create({
                        variantId: data.variant.id,
                        warehouseId: stock.warehouseId,
                        movementType: movement_type_enum_js_1.MovementType.OUT,
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
            for (const p of regularPayments) {
                const receivedAmount = p.receivedAmount ?? p.amount;
                const changeAmount = p.method === payment_method_enum_js_1.PaymentMethod.EFECTIVO
                    ? Math.max(0, receivedAmount - p.amount)
                    : 0;
                const payment = paymentRepo.create({
                    saleId: savedSale.id,
                    method: p.method,
                    amount: p.amount,
                    reference: p.reference,
                    receiptImageUrl: p.receiptImageUrl,
                    receivedAmount,
                    changeAmount,
                    tenantId,
                });
                await paymentRepo.save(payment);
            }
            if (totalCredit > 0) {
                const arRepo = manager.getRepository(accounts_receivable_entity_js_1.AccountsReceivable);
                const ar = arRepo.create({
                    saleId: savedSale.id,
                    clientId: clientId,
                    totalAmount: totalCredit,
                    paidAmount: 0,
                    dueDate: new Date(dto.creditDueDate),
                    notes: dto.creditNotes,
                    tenantId,
                });
                await arRepo.save(ar);
            }
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
                throw new common_1.NotFoundException('Venta no encontrada después de crear');
            }
            return fullSale;
        });
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
                .catch(() => { });
        }
        return fullSale;
    }
    async sendSaleInvoice(saleId, email, tenantId) {
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
    async findAll(filters, tenantId) {
        const where = { tenantId };
        if (filters?.status)
            where.status = filters.status;
        if (filters?.warehouseId)
            where.warehouseId = filters.warehouseId;
        if (filters?.userId)
            where.userId = filters.userId;
        return this.saleRepository.find({
            where,
            relations: ['client', 'user', 'warehouse', 'items', 'payments'],
            order: { createdAt: 'DESC' },
            take: filters?.limit || 100,
        });
    }
    async findOne(id, tenantId) {
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
            throw new common_1.NotFoundException('Venta no encontrada');
        }
        return sale;
    }
    async getReceipt(id, tenantId) {
        const sale = await this.findOne(id, tenantId);
        return this.receiptService.generateReceipt(sale);
    }
    async cancelSale(id, userId, tenantId) {
        return this.dataSource.transaction(async (manager) => {
            const saleRepo = manager.getRepository(sale_entity_js_1.Sale);
            const stockRepo = manager.getRepository(stock_entity_js_1.Stock);
            const movementRepo = manager.getRepository(stock_movement_entity_js_1.StockMovement);
            const sale = await saleRepo.findOne({
                where: { id, tenantId },
                relations: ['items'],
            });
            if (!sale) {
                throw new common_1.NotFoundException('Venta no encontrada');
            }
            if (sale.status !== sale_status_enum_js_1.SaleStatus.COMPLETED) {
                throw new common_1.BadRequestException('Solo se pueden cancelar ventas completadas');
            }
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
                    movementType: movement_type_enum_js_1.MovementType.IN,
                    quantity: Math.abs(Number(mov.quantity)),
                    referenceType: 'SALE_CANCEL',
                    referenceId: sale.id,
                    notes: `Cancelación venta ${sale.saleNumber}`,
                    createdById: userId,
                    tenantId,
                });
                await movementRepo.save(reversal);
            }
            sale.status = sale_status_enum_js_1.SaleStatus.CANCELLED;
            await saleRepo.save(sale);
            return this.findOne(id, tenantId);
        });
    }
    async getDailySummary(warehouseId, tenantId) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const qb = this.saleRepository
            .createQueryBuilder('s')
            .leftJoinAndSelect('s.items', 'items')
            .leftJoinAndSelect('s.payments', 'payments')
            .leftJoinAndSelect('s.accountsReceivable', 'ar')
            .where('s.status = :status', { status: sale_status_enum_js_1.SaleStatus.COMPLETED })
            .andWhere('s.created_at >= :today', { today: today.toISOString() })
            .andWhere('s.tenant_id = :tenantId', { tenantId });
        if (warehouseId) {
            qb.andWhere('s.warehouse_id = :wid', { wid: warehouseId });
        }
        const sales = await qb.getMany();
        const totalSales = sales.length;
        const totalAmount = sales.reduce((sum, s) => sum + Number(s.total), 0);
        const totalItems = sales.reduce((sum, s) => sum + s.items.reduce((iSum, i) => iSum + i.quantity, 0), 0);
        const byPaymentMethod = {};
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
    async findAllAccountsReceivable(filters, tenantId) {
        const where = { tenantId };
        if (filters?.isFullyPaid !== undefined)
            where.isFullyPaid = filters.isFullyPaid;
        if (filters?.clientId)
            where.clientId = filters.clientId;
        return this.arRepository.find({
            where,
            relations: ['sale', 'client', 'payments'],
            order: { createdAt: 'DESC' },
        });
    }
    async findOneAccountReceivable(id, tenantId) {
        const ar = await this.arRepository.findOne({
            where: { id, tenantId },
            relations: ['sale', 'client', 'payments'],
        });
        if (!ar) {
            throw new common_1.NotFoundException('Cuenta por cobrar no encontrada');
        }
        return ar;
    }
    async recordArPayment(arId, dto, tenantId) {
        return this.dataSource.transaction(async (manager) => {
            const arRepo = manager.getRepository(accounts_receivable_entity_js_1.AccountsReceivable);
            const arPayRepo = manager.getRepository(accounts_receivable_payment_entity_js_1.AccountsReceivablePayment);
            const ar = await arRepo.findOne({
                where: { id: arId, tenantId },
                relations: ['payments'],
            });
            if (!ar) {
                throw new common_1.NotFoundException('Cuenta por cobrar no encontrada');
            }
            if (ar.isFullyPaid) {
                throw new common_1.BadRequestException('Esta cuenta ya está completamente pagada');
            }
            const pending = Number(ar.totalAmount) - Number(ar.paidAmount);
            if (dto.amount > pending) {
                throw new common_1.BadRequestException(`El monto ($${dto.amount}) excede el saldo pendiente ($${pending.toFixed(2)})`);
            }
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
            const newPaidAmount = Number(ar.paidAmount) + dto.amount;
            const isFullyPaid = newPaidAmount >= Number(ar.totalAmount);
            await arRepo.update({ id: arId, tenantId }, {
                paidAmount: newPaidAmount,
                ...(isFullyPaid
                    ? { isFullyPaid: true, fullyPaidAt: new Date() }
                    : {}),
            });
            const updated = await arRepo.findOne({
                where: { id: arId, tenantId },
                relations: ['sale', 'client', 'payments'],
            });
            return updated;
        });
    }
    async getClientAccountSummary(clientId, tenantId) {
        const accounts = await this.arRepository.find({
            where: { clientId, tenantId },
        });
        const totalCredit = accounts.reduce((sum, a) => sum + Number(a.totalAmount), 0);
        const totalPaid = accounts.reduce((sum, a) => sum + Number(a.paidAmount), 0);
        return {
            totalCredit,
            totalPaid,
            totalPending: totalCredit - totalPaid,
            activeAccounts: accounts.filter((a) => !a.isFullyPaid).length,
        };
    }
};
exports.PosService = PosService;
exports.PosService = PosService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(sale_entity_js_1.Sale)),
    __param(1, (0, typeorm_1.InjectRepository)(sale_item_entity_js_1.SaleItem)),
    __param(2, (0, typeorm_1.InjectRepository)(payment_entity_js_1.Payment)),
    __param(3, (0, typeorm_1.InjectRepository)(accounts_receivable_entity_js_1.AccountsReceivable)),
    __param(4, (0, typeorm_1.InjectRepository)(accounts_receivable_payment_entity_js_1.AccountsReceivablePayment)),
    __param(5, (0, typeorm_1.InjectRepository)(product_variant_entity_js_1.ProductVariant)),
    __param(6, (0, typeorm_1.InjectRepository)(stock_entity_js_1.Stock)),
    __param(7, (0, typeorm_1.InjectRepository)(store_settings_entity_js_1.StoreSettings)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.DataSource,
        tax_service_js_1.TaxService,
        invoice_service_js_1.InvoiceService,
        receipt_service_js_1.ReceiptService,
        invoice_email_service_js_1.InvoiceEmailService])
], PosService);
//# sourceMappingURL=pos.service.js.map