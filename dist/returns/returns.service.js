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
exports.ReturnsService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const return_entity_js_1 = require("./entities/return.entity.js");
const return_item_entity_js_1 = require("./entities/return-item.entity.js");
const credit_note_entity_js_1 = require("./entities/credit-note.entity.js");
const sale_entity_js_1 = require("../pos/entities/sale.entity.js");
const sale_item_entity_js_1 = require("../pos/entities/sale-item.entity.js");
const stock_entity_js_1 = require("../inventory/entities/stock.entity.js");
const stock_movement_entity_js_1 = require("../inventory/entities/stock-movement.entity.js");
const return_status_enum_js_1 = require("../common/enums/return-status.enum.js");
const sale_status_enum_js_1 = require("../common/enums/sale-status.enum.js");
const movement_type_enum_js_1 = require("../common/enums/movement-type.enum.js");
let ReturnsService = class ReturnsService {
    returnRepository;
    creditNoteRepository;
    dataSource;
    constructor(returnRepository, creditNoteRepository, dataSource) {
        this.returnRepository = returnRepository;
        this.creditNoteRepository = creditNoteRepository;
        this.dataSource = dataSource;
    }
    async generateReturnNumber(tenantId) {
        const today = new Date();
        const prefix = `DEV-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
        const count = await this.returnRepository
            .createQueryBuilder('r')
            .where('r.return_number LIKE :prefix', { prefix: `${prefix}%` })
            .andWhere('r.tenant_id = :tenantId', { tenantId })
            .getCount();
        return `${prefix}-${String(count + 1).padStart(4, '0')}`;
    }
    async generateCreditNoteNumber(tenantId) {
        const count = await this.creditNoteRepository.count({
            where: { tenantId },
        });
        return `NC-${String(count + 1).padStart(6, '0')}`;
    }
    async create(dto, userId, tenantId) {
        return this.dataSource.transaction(async (manager) => {
            const saleRepo = manager.getRepository(sale_entity_js_1.Sale);
            const saleItemRepo = manager.getRepository(sale_item_entity_js_1.SaleItem);
            const returnRepo = manager.getRepository(return_entity_js_1.Return);
            const returnItemRepo = manager.getRepository(return_item_entity_js_1.ReturnItem);
            const creditNoteRepo = manager.getRepository(credit_note_entity_js_1.CreditNote);
            const stockRepo = manager.getRepository(stock_entity_js_1.Stock);
            const movementRepo = manager.getRepository(stock_movement_entity_js_1.StockMovement);
            const sale = await saleRepo.findOne({
                where: { id: dto.saleId, tenantId },
                relations: ['items', 'client'],
            });
            if (!sale) {
                throw new common_1.NotFoundException('Venta no encontrada');
            }
            if (sale.status !== sale_status_enum_js_1.SaleStatus.COMPLETED) {
                throw new common_1.BadRequestException('Solo se pueden devolver ventas completadas');
            }
            const returnNumber = await this.generateReturnNumber(tenantId);
            let refundAmount = 0;
            const returnItemsData = [];
            for (const itemDto of dto.items) {
                const saleItem = sale.items.find((i) => i.id === itemDto.saleItemId);
                if (!saleItem) {
                    throw new common_1.NotFoundException(`Item de venta ${itemDto.saleItemId} no encontrado`);
                }
                if (itemDto.quantity > saleItem.quantity) {
                    throw new common_1.BadRequestException(`Cantidad a devolver (${itemDto.quantity}) excede la vendida (${saleItem.quantity}) para "${saleItem.productName}"`);
                }
                returnItemsData.push({ saleItem, quantity: itemDto.quantity });
                refundAmount += itemDto.quantity * Number(saleItem.unitPrice);
            }
            const returnEntity = returnRepo.create({
                returnNumber,
                saleId: sale.id,
                clientId: sale.clientId,
                userId,
                reason: dto.reason,
                status: return_status_enum_js_1.ReturnStatus.COMPLETED,
                refundAmount,
                tenantId,
            });
            const savedReturn = await returnRepo.save(returnEntity);
            for (const { saleItem, quantity } of returnItemsData) {
                const ri = returnItemRepo.create({
                    returnId: savedReturn.id,
                    saleItemId: saleItem.id,
                    variantId: saleItem.variantId,
                    quantity,
                    unitPrice: saleItem.unitPrice,
                    tenantId,
                });
                await returnItemRepo.save(ri);
                const stock = await stockRepo.findOne({
                    where: { variantId: saleItem.variantId, warehouseId: sale.warehouseId, tenantId },
                });
                if (stock) {
                    stock.quantity += quantity;
                    await stockRepo.save(stock);
                }
                const movement = movementRepo.create({
                    variantId: saleItem.variantId,
                    warehouseId: sale.warehouseId,
                    movementType: movement_type_enum_js_1.MovementType.IN,
                    quantity,
                    referenceType: 'RETURN',
                    referenceId: savedReturn.id,
                    notes: `Devolución ${returnNumber}`,
                    createdById: userId,
                    tenantId,
                });
                await movementRepo.save(movement);
            }
            const cnNumber = await this.generateCreditNoteNumber(tenantId);
            const creditNote = creditNoteRepo.create({
                creditNoteNumber: cnNumber,
                returnId: savedReturn.id,
                amount: refundAmount,
                notes: `Nota crédito por devolución ${returnNumber}`,
                tenantId,
            });
            await creditNoteRepo.save(creditNote);
            const fullReturn = await returnRepo.findOne({
                where: { id: savedReturn.id, tenantId },
                relations: ['sale', 'client', 'user', 'items', 'items.variant', 'creditNotes'],
            });
            if (!fullReturn) {
                throw new common_1.NotFoundException('Devolución no encontrada después de crear');
            }
            return fullReturn;
        });
    }
    async findAll(tenantId) {
        return this.returnRepository.find({
            where: { tenantId },
            relations: ['sale', 'client', 'user', 'items', 'creditNotes'],
            order: { createdAt: 'DESC' },
        });
    }
    async findOne(id, tenantId) {
        const ret = await this.returnRepository.findOne({
            where: { id, tenantId },
            relations: ['sale', 'client', 'user', 'items', 'items.variant', 'items.saleItem', 'creditNotes'],
        });
        if (!ret) {
            throw new common_1.NotFoundException('Devolución no encontrada');
        }
        return ret;
    }
    async findCreditNotes(tenantId) {
        return this.creditNoteRepository.find({
            where: { tenantId },
            relations: ['return', 'return.sale', 'return.client'],
            order: { createdAt: 'DESC' },
        });
    }
};
exports.ReturnsService = ReturnsService;
exports.ReturnsService = ReturnsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(return_entity_js_1.Return)),
    __param(1, (0, typeorm_1.InjectRepository)(credit_note_entity_js_1.CreditNote)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.DataSource])
], ReturnsService);
//# sourceMappingURL=returns.service.js.map