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
exports.InventoryController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const inventory_service_js_1 = require("./inventory.service.js");
const create_warehouse_dto_js_1 = require("./dto/create-warehouse.dto.js");
const update_warehouse_dto_js_1 = require("./dto/update-warehouse.dto.js");
const adjust_stock_dto_js_1 = require("./dto/adjust-stock.dto.js");
const transfer_stock_dto_js_1 = require("./dto/transfer-stock.dto.js");
const current_user_decorator_js_1 = require("../common/decorators/current-user.decorator.js");
const tenant_id_decorator_js_1 = require("../common/decorators/tenant-id.decorator.js");
const user_entity_js_1 = require("../users/entities/user.entity.js");
const movement_type_enum_js_1 = require("../common/enums/movement-type.enum.js");
let InventoryController = class InventoryController {
    inventoryService;
    constructor(inventoryService) {
        this.inventoryService = inventoryService;
    }
    createWarehouse(dto, tenantId) {
        return this.inventoryService.createWarehouse(dto, tenantId);
    }
    findAllWarehouses(tenantId) {
        return this.inventoryService.findAllWarehouses(tenantId);
    }
    findWarehouse(id, tenantId) {
        return this.inventoryService.findWarehouse(id, tenantId);
    }
    updateWarehouse(id, dto, tenantId) {
        return this.inventoryService.updateWarehouse(id, dto, tenantId);
    }
    removeWarehouse(id, tenantId) {
        return this.inventoryService.removeWarehouse(id, tenantId);
    }
    getAllStock(tenantId) {
        return this.inventoryService.getAllStock(tenantId);
    }
    getLowStock(tenantId) {
        return this.inventoryService.getLowStock(tenantId);
    }
    getStockByWarehouse(warehouseId, tenantId) {
        return this.inventoryService.getStockByWarehouse(warehouseId, tenantId);
    }
    getStockByVariant(variantId, tenantId) {
        return this.inventoryService.getStockByVariant(variantId, tenantId);
    }
    adjustStock(dto, user, tenantId) {
        return this.inventoryService.adjustStock(dto, user.id, tenantId);
    }
    transferStock(dto, user, tenantId) {
        return this.inventoryService.transferStock(dto, user.id, tenantId);
    }
    getMovements(tenantId, warehouseId, variantId, movementType, limit) {
        return this.inventoryService.getMovements(tenantId, {
            warehouseId,
            variantId,
            movementType,
            limit: limit ? parseInt(limit, 10) : undefined,
        });
    }
    setMinStock(variantId, warehouseId, minStock, tenantId) {
        return this.inventoryService.setMinStock(variantId, warehouseId, minStock, tenantId);
    }
};
exports.InventoryController = InventoryController;
__decorate([
    (0, common_1.Post)('warehouses'),
    (0, swagger_1.ApiOperation)({ summary: 'Crear bodega' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, tenant_id_decorator_js_1.TenantId)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_warehouse_dto_js_1.CreateWarehouseDto, String]),
    __metadata("design:returntype", void 0)
], InventoryController.prototype, "createWarehouse", null);
__decorate([
    (0, common_1.Get)('warehouses'),
    (0, swagger_1.ApiOperation)({ summary: 'Listar bodegas' }),
    __param(0, (0, tenant_id_decorator_js_1.TenantId)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], InventoryController.prototype, "findAllWarehouses", null);
__decorate([
    (0, common_1.Get)('warehouses/:id'),
    (0, swagger_1.ApiOperation)({ summary: 'Obtener bodega por ID' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, tenant_id_decorator_js_1.TenantId)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], InventoryController.prototype, "findWarehouse", null);
__decorate([
    (0, common_1.Patch)('warehouses/:id'),
    (0, swagger_1.ApiOperation)({ summary: 'Actualizar bodega' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, tenant_id_decorator_js_1.TenantId)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_warehouse_dto_js_1.UpdateWarehouseDto, String]),
    __metadata("design:returntype", void 0)
], InventoryController.prototype, "updateWarehouse", null);
__decorate([
    (0, common_1.Delete)('warehouses/:id'),
    (0, swagger_1.ApiOperation)({ summary: 'Eliminar bodega' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, tenant_id_decorator_js_1.TenantId)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], InventoryController.prototype, "removeWarehouse", null);
__decorate([
    (0, common_1.Get)('stock'),
    (0, swagger_1.ApiOperation)({ summary: 'Obtener todo el stock' }),
    __param(0, (0, tenant_id_decorator_js_1.TenantId)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], InventoryController.prototype, "getAllStock", null);
__decorate([
    (0, common_1.Get)('stock/low'),
    (0, swagger_1.ApiOperation)({ summary: 'Stock por debajo del mínimo' }),
    __param(0, (0, tenant_id_decorator_js_1.TenantId)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], InventoryController.prototype, "getLowStock", null);
__decorate([
    (0, common_1.Get)('stock/warehouse/:warehouseId'),
    (0, swagger_1.ApiOperation)({ summary: 'Stock por bodega' }),
    __param(0, (0, common_1.Param)('warehouseId', common_1.ParseUUIDPipe)),
    __param(1, (0, tenant_id_decorator_js_1.TenantId)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], InventoryController.prototype, "getStockByWarehouse", null);
__decorate([
    (0, common_1.Get)('stock/variant/:variantId'),
    (0, swagger_1.ApiOperation)({ summary: 'Stock por variante en todas las bodegas' }),
    __param(0, (0, common_1.Param)('variantId', common_1.ParseUUIDPipe)),
    __param(1, (0, tenant_id_decorator_js_1.TenantId)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], InventoryController.prototype, "getStockByVariant", null);
__decorate([
    (0, common_1.Post)('adjust'),
    (0, swagger_1.ApiOperation)({ summary: 'Ajustar stock (entrada, salida, ajuste)' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_js_1.CurrentUser)()),
    __param(2, (0, tenant_id_decorator_js_1.TenantId)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [adjust_stock_dto_js_1.AdjustStockDto,
        user_entity_js_1.User, String]),
    __metadata("design:returntype", void 0)
], InventoryController.prototype, "adjustStock", null);
__decorate([
    (0, common_1.Post)('transfer'),
    (0, swagger_1.ApiOperation)({ summary: 'Trasladar stock entre bodegas' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_js_1.CurrentUser)()),
    __param(2, (0, tenant_id_decorator_js_1.TenantId)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [transfer_stock_dto_js_1.TransferStockDto,
        user_entity_js_1.User, String]),
    __metadata("design:returntype", void 0)
], InventoryController.prototype, "transferStock", null);
__decorate([
    (0, common_1.Get)('movements'),
    (0, swagger_1.ApiOperation)({ summary: 'Historial de movimientos' }),
    (0, swagger_1.ApiQuery)({ name: 'warehouseId', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'variantId', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'movementType', required: false, enum: movement_type_enum_js_1.MovementType }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false }),
    __param(0, (0, tenant_id_decorator_js_1.TenantId)()),
    __param(1, (0, common_1.Query)('warehouseId')),
    __param(2, (0, common_1.Query)('variantId')),
    __param(3, (0, common_1.Query)('movementType')),
    __param(4, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, String]),
    __metadata("design:returntype", void 0)
], InventoryController.prototype, "getMovements", null);
__decorate([
    (0, common_1.Patch)('stock/min/:variantId/:warehouseId'),
    (0, swagger_1.ApiOperation)({ summary: 'Configurar stock mínimo' }),
    __param(0, (0, common_1.Param)('variantId', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Param)('warehouseId', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)('minStock')),
    __param(3, (0, tenant_id_decorator_js_1.TenantId)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Number, String]),
    __metadata("design:returntype", void 0)
], InventoryController.prototype, "setMinStock", null);
exports.InventoryController = InventoryController = __decorate([
    (0, swagger_1.ApiTags)('Inventario'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('inventory'),
    __metadata("design:paramtypes", [inventory_service_js_1.InventoryService])
], InventoryController);
//# sourceMappingURL=inventory.controller.js.map