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
exports.InventoryService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const warehouse_entity_js_1 = require("./entities/warehouse.entity.js");
const stock_entity_js_1 = require("./entities/stock.entity.js");
const stock_movement_entity_js_1 = require("./entities/stock-movement.entity.js");
const movement_type_enum_js_1 = require("../common/enums/movement-type.enum.js");
let InventoryService = class InventoryService {
    warehouseRepository;
    stockRepository;
    movementRepository;
    dataSource;
    constructor(warehouseRepository, stockRepository, movementRepository, dataSource) {
        this.warehouseRepository = warehouseRepository;
        this.stockRepository = stockRepository;
        this.movementRepository = movementRepository;
        this.dataSource = dataSource;
    }
    async createWarehouse(dto, tenantId) {
        const existing = await this.warehouseRepository.findOne({
            where: [
                { name: dto.name, tenantId },
                { code: dto.code, tenantId },
            ],
        });
        if (existing) {
            throw new common_1.ConflictException('Ya existe una bodega con ese nombre o código');
        }
        const warehouse = this.warehouseRepository.create({ ...dto, tenantId });
        return this.warehouseRepository.save(warehouse);
    }
    async findAllWarehouses(tenantId) {
        return this.warehouseRepository.find({
            where: { tenantId },
            order: { name: 'ASC' },
        });
    }
    async findWarehouse(id, tenantId) {
        const warehouse = await this.warehouseRepository.findOne({
            where: { id, tenantId },
        });
        if (!warehouse)
            throw new common_1.NotFoundException('Bodega no encontrada');
        return warehouse;
    }
    async updateWarehouse(id, dto, tenantId) {
        const warehouse = await this.findWarehouse(id, tenantId);
        if (dto.name !== undefined)
            warehouse.name = dto.name;
        if (dto.code !== undefined)
            warehouse.code = dto.code;
        if (dto.address !== undefined)
            warehouse.address = dto.address;
        if (dto.isPosLocation !== undefined)
            warehouse.isPosLocation = dto.isPosLocation;
        if (dto.isActive !== undefined)
            warehouse.isActive = dto.isActive;
        return this.warehouseRepository.save(warehouse);
    }
    async removeWarehouse(id, tenantId) {
        const warehouse = await this.findWarehouse(id, tenantId);
        await this.warehouseRepository.remove(warehouse);
    }
    async getStockByWarehouse(warehouseId, tenantId) {
        return this.stockRepository.find({
            where: { warehouseId, tenantId },
            relations: ['variant', 'variant.product', 'warehouse'],
            order: { variant: { product: { name: 'ASC' } } },
        });
    }
    async getStockByVariant(variantId, tenantId) {
        return this.stockRepository.find({
            where: { variantId, tenantId },
            relations: ['variant', 'variant.product', 'warehouse'],
        });
    }
    async getAllStock(tenantId) {
        return this.stockRepository.find({
            where: { tenantId },
            relations: ['variant', 'variant.product', 'warehouse'],
            order: { warehouse: { name: 'ASC' } },
        });
    }
    async getLowStock(tenantId) {
        const all = await this.stockRepository.find({
            where: { tenantId },
            relations: ['variant', 'variant.product', 'warehouse'],
            order: { quantity: 'ASC' },
        });
        return all.filter((s) => s.minStock > 0 && s.quantity <= s.minStock);
    }
    async getOrCreateStock(variantId, warehouseId, tenantId) {
        let stock = await this.stockRepository.findOne({
            where: { variantId, warehouseId, tenantId },
        });
        if (!stock) {
            stock = this.stockRepository.create({
                variantId,
                warehouseId,
                tenantId,
                quantity: 0,
                minStock: 0,
            });
            stock = await this.stockRepository.save(stock);
        }
        return stock;
    }
    async adjustStock(dto, userId, tenantId) {
        return this.dataSource.transaction(async (manager) => {
            const stockRepo = manager.getRepository(stock_entity_js_1.Stock);
            const movementRepo = manager.getRepository(stock_movement_entity_js_1.StockMovement);
            let stock = await stockRepo.findOne({
                where: { variantId: dto.variantId, warehouseId: dto.warehouseId, tenantId },
            });
            if (!stock) {
                stock = stockRepo.create({
                    variantId: dto.variantId,
                    warehouseId: dto.warehouseId,
                    tenantId,
                    quantity: 0,
                    minStock: 0,
                });
            }
            switch (dto.movementType) {
                case movement_type_enum_js_1.MovementType.IN:
                    stock.quantity += dto.quantity;
                    break;
                case movement_type_enum_js_1.MovementType.OUT:
                    if (stock.quantity < dto.quantity) {
                        throw new common_1.BadRequestException(`Stock insuficiente. Disponible: ${stock.quantity}`);
                    }
                    stock.quantity -= dto.quantity;
                    break;
                case movement_type_enum_js_1.MovementType.ADJUSTMENT:
                    stock.quantity = dto.quantity;
                    break;
            }
            await stockRepo.save(stock);
            const movement = movementRepo.create({
                variantId: dto.variantId,
                warehouseId: dto.warehouseId,
                tenantId,
                movementType: dto.movementType,
                quantity: dto.quantity,
                notes: dto.notes,
                createdById: userId,
            });
            await movementRepo.save(movement);
            return stockRepo.findOne({
                where: { id: stock.id },
                relations: ['variant', 'variant.product', 'warehouse'],
            });
        });
    }
    async transferStock(dto, userId, tenantId) {
        if (dto.fromWarehouseId === dto.toWarehouseId) {
            throw new common_1.BadRequestException('La bodega origen y destino deben ser diferentes');
        }
        return this.dataSource.transaction(async (manager) => {
            const stockRepo = manager.getRepository(stock_entity_js_1.Stock);
            const movementRepo = manager.getRepository(stock_movement_entity_js_1.StockMovement);
            let fromStock = await stockRepo.findOne({
                where: { variantId: dto.variantId, warehouseId: dto.fromWarehouseId, tenantId },
            });
            if (!fromStock || fromStock.quantity < dto.quantity) {
                throw new common_1.BadRequestException(`Stock insuficiente en bodega origen. Disponible: ${fromStock?.quantity ?? 0}`);
            }
            let toStock = await stockRepo.findOne({
                where: { variantId: dto.variantId, warehouseId: dto.toWarehouseId, tenantId },
            });
            if (!toStock) {
                toStock = stockRepo.create({
                    variantId: dto.variantId,
                    warehouseId: dto.toWarehouseId,
                    tenantId,
                    quantity: 0,
                    minStock: 0,
                });
            }
            fromStock.quantity -= dto.quantity;
            toStock.quantity += dto.quantity;
            await stockRepo.save(fromStock);
            await stockRepo.save(toStock);
            const outMovement = movementRepo.create({
                variantId: dto.variantId,
                warehouseId: dto.fromWarehouseId,
                tenantId,
                movementType: movement_type_enum_js_1.MovementType.TRANSFER,
                quantity: -dto.quantity,
                referenceType: 'TRANSFER',
                referenceId: dto.toWarehouseId,
                notes: dto.notes || `Traslado a bodega destino`,
                createdById: userId,
            });
            const inMovement = movementRepo.create({
                variantId: dto.variantId,
                warehouseId: dto.toWarehouseId,
                tenantId,
                movementType: movement_type_enum_js_1.MovementType.TRANSFER,
                quantity: dto.quantity,
                referenceType: 'TRANSFER',
                referenceId: dto.fromWarehouseId,
                notes: dto.notes || `Traslado desde bodega origen`,
                createdById: userId,
            });
            await movementRepo.save([outMovement, inMovement]);
            const from = await stockRepo.findOne({
                where: { id: fromStock.id },
                relations: ['variant', 'variant.product', 'warehouse'],
            });
            const to = await stockRepo.findOne({
                where: { id: toStock.id },
                relations: ['variant', 'variant.product', 'warehouse'],
            });
            return { from: from, to: to };
        });
    }
    async getMovements(tenantId, filters) {
        const where = { tenantId };
        if (filters?.warehouseId)
            where.warehouseId = filters.warehouseId;
        if (filters?.variantId)
            where.variantId = filters.variantId;
        if (filters?.movementType)
            where.movementType = filters.movementType;
        return this.movementRepository.find({
            where,
            relations: ['variant', 'variant.product', 'warehouse', 'createdBy'],
            order: { createdAt: 'DESC' },
            take: filters?.limit || 100,
        });
    }
    async setMinStock(variantId, warehouseId, minStock, tenantId) {
        const stock = await this.getOrCreateStock(variantId, warehouseId, tenantId);
        stock.minStock = minStock;
        return this.stockRepository.save(stock);
    }
};
exports.InventoryService = InventoryService;
exports.InventoryService = InventoryService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(warehouse_entity_js_1.Warehouse)),
    __param(1, (0, typeorm_1.InjectRepository)(stock_entity_js_1.Stock)),
    __param(2, (0, typeorm_1.InjectRepository)(stock_movement_entity_js_1.StockMovement)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.DataSource])
], InventoryService);
//# sourceMappingURL=inventory.service.js.map