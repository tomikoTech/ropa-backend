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
exports.PurchasesService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const purchase_order_entity_js_1 = require("./entities/purchase-order.entity.js");
const purchase_order_item_entity_js_1 = require("./entities/purchase-order-item.entity.js");
const accounts_payable_entity_js_1 = require("./entities/accounts-payable.entity.js");
const product_variant_entity_js_1 = require("../products/entities/product-variant.entity.js");
const stock_entity_js_1 = require("../inventory/entities/stock.entity.js");
const stock_movement_entity_js_1 = require("../inventory/entities/stock-movement.entity.js");
const purchase_order_status_enum_js_1 = require("../common/enums/purchase-order-status.enum.js");
const movement_type_enum_js_1 = require("../common/enums/movement-type.enum.js");
let PurchasesService = class PurchasesService {
    poRepository;
    poItemRepository;
    apRepository;
    variantRepository;
    dataSource;
    constructor(poRepository, poItemRepository, apRepository, variantRepository, dataSource) {
        this.poRepository = poRepository;
        this.poItemRepository = poItemRepository;
        this.apRepository = apRepository;
        this.variantRepository = variantRepository;
        this.dataSource = dataSource;
    }
    async generateOrderNumber(tenantId) {
        const today = new Date();
        const prefix = `OC-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
        const count = await this.poRepository
            .createQueryBuilder('po')
            .where('po.order_number LIKE :prefix', { prefix: `${prefix}%` })
            .andWhere('po.tenant_id = :tenantId', { tenantId })
            .getCount();
        return `${prefix}-${String(count + 1).padStart(4, '0')}`;
    }
    async create(dto, userId, tenantId) {
        for (const item of dto.items) {
            const variant = await this.variantRepository.findOne({
                where: { id: item.variantId, tenantId },
            });
            if (!variant) {
                throw new common_1.NotFoundException(`Variante ${item.variantId} no encontrada`);
            }
        }
        const orderNumber = await this.generateOrderNumber(tenantId);
        const total = dto.items.reduce((sum, i) => sum + i.quantityOrdered * i.unitCost, 0);
        const po = this.poRepository.create({
            orderNumber,
            supplierId: dto.supplierId,
            warehouseId: dto.warehouseId,
            createdById: userId,
            total,
            notes: dto.notes,
            status: purchase_order_status_enum_js_1.PurchaseOrderStatus.DRAFT,
            tenantId,
        });
        const savedPo = await this.poRepository.save(po);
        const items = dto.items.map((i) => this.poItemRepository.create({
            purchaseOrderId: savedPo.id,
            variantId: i.variantId,
            quantityOrdered: i.quantityOrdered,
            unitCost: i.unitCost,
            tenantId,
        }));
        await this.poItemRepository.save(items);
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
    async findAll(filters, tenantId) {
        const where = { tenantId };
        if (filters?.status)
            where.status = filters.status;
        if (filters?.supplierId)
            where.supplierId = filters.supplierId;
        return this.poRepository.find({
            where,
            relations: [
                'supplier',
                'warehouse',
                'createdBy',
                'items',
                'items.variant',
                'accountsPayable',
            ],
            order: { createdAt: 'DESC' },
        });
    }
    async findOne(id, tenantId) {
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
            throw new common_1.NotFoundException('Orden de compra no encontrada');
        }
        return po;
    }
    async send(id, tenantId) {
        const po = await this.findOne(id, tenantId);
        if (po.status !== purchase_order_status_enum_js_1.PurchaseOrderStatus.DRAFT) {
            throw new common_1.BadRequestException('Solo se pueden enviar órdenes en estado borrador');
        }
        po.status = purchase_order_status_enum_js_1.PurchaseOrderStatus.SENT;
        await this.poRepository.save(po);
        return this.findOne(id, tenantId);
    }
    async receiveItems(id, dto, userId, tenantId) {
        return this.dataSource.transaction(async (manager) => {
            const poRepo = manager.getRepository(purchase_order_entity_js_1.PurchaseOrder);
            const poItemRepo = manager.getRepository(purchase_order_item_entity_js_1.PurchaseOrderItem);
            const stockRepo = manager.getRepository(stock_entity_js_1.Stock);
            const movementRepo = manager.getRepository(stock_movement_entity_js_1.StockMovement);
            const po = await poRepo.findOne({
                where: { id, tenantId },
                relations: ['items'],
            });
            if (!po) {
                throw new common_1.NotFoundException('Orden de compra no encontrada');
            }
            if (po.status !== purchase_order_status_enum_js_1.PurchaseOrderStatus.SENT &&
                po.status !== purchase_order_status_enum_js_1.PurchaseOrderStatus.PARTIAL) {
                throw new common_1.BadRequestException('Solo se pueden recibir items de órdenes enviadas o parciales');
            }
            for (const receiveItem of dto.items) {
                const poItem = po.items.find((i) => i.id === receiveItem.itemId);
                if (!poItem) {
                    throw new common_1.NotFoundException(`Item ${receiveItem.itemId} no encontrado en la orden`);
                }
                const remaining = poItem.quantityOrdered - poItem.quantityReceived;
                if (receiveItem.quantityReceived > remaining) {
                    throw new common_1.BadRequestException(`Cantidad recibida (${receiveItem.quantityReceived}) excede pendiente (${remaining}) para item ${poItem.id}`);
                }
                poItem.quantityReceived += receiveItem.quantityReceived;
                await poItemRepo.save(poItem);
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
                }
                else {
                    stock = stockRepo.create({
                        variantId: poItem.variantId,
                        warehouseId: po.warehouseId,
                        quantity: receiveItem.quantityReceived,
                        minStock: 3,
                        tenantId,
                    });
                    await stockRepo.save(stock);
                }
                const movement = movementRepo.create({
                    variantId: poItem.variantId,
                    warehouseId: po.warehouseId,
                    movementType: movement_type_enum_js_1.MovementType.IN,
                    quantity: receiveItem.quantityReceived,
                    referenceType: 'PURCHASE',
                    referenceId: po.id,
                    notes: `Recepción OC ${po.orderNumber}`,
                    createdById: userId,
                    tenantId,
                });
                await movementRepo.save(movement);
            }
            const updatedItems = await poItemRepo.find({
                where: { purchaseOrderId: id, tenantId },
            });
            const allReceived = updatedItems.every((i) => i.quantityReceived >= i.quantityOrdered);
            const someReceived = updatedItems.some((i) => i.quantityReceived > 0);
            if (allReceived) {
                po.status = purchase_order_status_enum_js_1.PurchaseOrderStatus.RECEIVED;
            }
            else if (someReceived) {
                po.status = purchase_order_status_enum_js_1.PurchaseOrderStatus.PARTIAL;
            }
            await poRepo.save(po);
            const fullPo = await poRepo.findOne({
                where: { id, tenantId },
                relations: [
                    'supplier',
                    'warehouse',
                    'createdBy',
                    'items',
                    'items.variant',
                    'accountsPayable',
                ],
            });
            if (!fullPo) {
                throw new common_1.NotFoundException('Orden no encontrada después de recibir');
            }
            return fullPo;
        });
    }
    async cancel(id, tenantId) {
        const po = await this.findOne(id, tenantId);
        if (po.status === purchase_order_status_enum_js_1.PurchaseOrderStatus.RECEIVED) {
            throw new common_1.BadRequestException('No se puede cancelar una orden completamente recibida');
        }
        po.status = purchase_order_status_enum_js_1.PurchaseOrderStatus.CANCELLED;
        await this.poRepository.save(po);
        return this.findOne(id, tenantId);
    }
    async findAllAccountsPayable(filters, tenantId) {
        const where = { tenantId };
        if (filters?.isPaid !== undefined)
            where.isPaid = filters.isPaid;
        return this.apRepository.find({
            where,
            relations: ['purchaseOrder', 'purchaseOrder.supplier'],
            order: { dueDate: 'ASC' },
        });
    }
    async markAsPaid(apId, receiptImageUrl, tenantId) {
        const ap = await this.apRepository.findOne({
            where: { id: apId, tenantId },
            relations: ['purchaseOrder', 'purchaseOrder.supplier'],
        });
        if (!ap) {
            throw new common_1.NotFoundException('Cuenta por pagar no encontrada');
        }
        if (ap.isPaid) {
            throw new common_1.BadRequestException('Esta cuenta ya fue pagada');
        }
        ap.isPaid = true;
        ap.paidAt = new Date();
        if (receiptImageUrl) {
            ap.receiptImageUrl = receiptImageUrl;
        }
        return this.apRepository.save(ap);
    }
};
exports.PurchasesService = PurchasesService;
exports.PurchasesService = PurchasesService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(purchase_order_entity_js_1.PurchaseOrder)),
    __param(1, (0, typeorm_1.InjectRepository)(purchase_order_item_entity_js_1.PurchaseOrderItem)),
    __param(2, (0, typeorm_1.InjectRepository)(accounts_payable_entity_js_1.AccountsPayable)),
    __param(3, (0, typeorm_1.InjectRepository)(product_variant_entity_js_1.ProductVariant)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.DataSource])
], PurchasesService);
//# sourceMappingURL=purchases.service.js.map