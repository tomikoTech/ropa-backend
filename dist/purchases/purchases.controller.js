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
exports.PurchasesController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const purchases_service_js_1 = require("./purchases.service.js");
const create_purchase_order_dto_js_1 = require("./dto/create-purchase-order.dto.js");
const receive_items_dto_js_1 = require("./dto/receive-items.dto.js");
const current_user_decorator_js_1 = require("../common/decorators/current-user.decorator.js");
const tenant_id_decorator_js_1 = require("../common/decorators/tenant-id.decorator.js");
const roles_decorator_js_1 = require("../common/decorators/roles.decorator.js");
const role_enum_js_1 = require("../common/enums/role.enum.js");
const purchase_order_status_enum_js_1 = require("../common/enums/purchase-order-status.enum.js");
let PurchasesController = class PurchasesController {
    purchasesService;
    constructor(purchasesService) {
        this.purchasesService = purchasesService;
    }
    create(dto, user, tenantId) {
        return this.purchasesService.create(dto, user.id, tenantId);
    }
    findAll(tenantId, status, supplierId) {
        return this.purchasesService.findAll({ status, supplierId }, tenantId);
    }
    findAllAccountsPayable(tenantId, isPaid) {
        const filters = isPaid !== undefined ? { isPaid: isPaid === 'true' } : undefined;
        return this.purchasesService.findAllAccountsPayable(filters, tenantId);
    }
    findOne(id, tenantId) {
        return this.purchasesService.findOne(id, tenantId);
    }
    send(id, tenantId) {
        return this.purchasesService.send(id, tenantId);
    }
    receive(id, dto, user, tenantId) {
        return this.purchasesService.receiveItems(id, dto, user.id, tenantId);
    }
    cancel(id, tenantId) {
        return this.purchasesService.cancel(id, tenantId);
    }
    markAsPaid(id, body, tenantId) {
        return this.purchasesService.markAsPaid(id, body?.receiptImageUrl, tenantId);
    }
};
exports.PurchasesController = PurchasesController;
__decorate([
    (0, common_1.Post)(),
    (0, roles_decorator_js_1.Roles)(role_enum_js_1.Role.ADMIN),
    (0, swagger_1.ApiOperation)({ summary: 'Crear orden de compra' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_js_1.CurrentUser)()),
    __param(2, (0, tenant_id_decorator_js_1.TenantId)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_purchase_order_dto_js_1.CreatePurchaseOrderDto, Object, String]),
    __metadata("design:returntype", void 0)
], PurchasesController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Listar órdenes de compra' }),
    __param(0, (0, tenant_id_decorator_js_1.TenantId)()),
    __param(1, (0, common_1.Query)('status')),
    __param(2, (0, common_1.Query)('supplierId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", void 0)
], PurchasesController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)('accounts-payable'),
    (0, roles_decorator_js_1.Roles)(role_enum_js_1.Role.ADMIN),
    (0, swagger_1.ApiOperation)({ summary: 'Listar cuentas por pagar' }),
    __param(0, (0, tenant_id_decorator_js_1.TenantId)()),
    __param(1, (0, common_1.Query)('isPaid')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], PurchasesController.prototype, "findAllAccountsPayable", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Obtener orden de compra por ID' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, tenant_id_decorator_js_1.TenantId)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], PurchasesController.prototype, "findOne", null);
__decorate([
    (0, common_1.Post)(':id/send'),
    (0, roles_decorator_js_1.Roles)(role_enum_js_1.Role.ADMIN),
    (0, swagger_1.ApiOperation)({ summary: 'Enviar orden de compra al proveedor' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, tenant_id_decorator_js_1.TenantId)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], PurchasesController.prototype, "send", null);
__decorate([
    (0, common_1.Post)(':id/receive'),
    (0, roles_decorator_js_1.Roles)(role_enum_js_1.Role.ADMIN),
    (0, swagger_1.ApiOperation)({ summary: 'Recibir items de orden de compra' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_js_1.CurrentUser)()),
    __param(3, (0, tenant_id_decorator_js_1.TenantId)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, receive_items_dto_js_1.ReceiveItemsDto, Object, String]),
    __metadata("design:returntype", void 0)
], PurchasesController.prototype, "receive", null);
__decorate([
    (0, common_1.Post)(':id/cancel'),
    (0, roles_decorator_js_1.Roles)(role_enum_js_1.Role.ADMIN),
    (0, swagger_1.ApiOperation)({ summary: 'Cancelar orden de compra' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, tenant_id_decorator_js_1.TenantId)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], PurchasesController.prototype, "cancel", null);
__decorate([
    (0, common_1.Post)('accounts-payable/:id/pay'),
    (0, roles_decorator_js_1.Roles)(role_enum_js_1.Role.ADMIN),
    (0, swagger_1.ApiOperation)({ summary: 'Marcar cuenta como pagada' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, tenant_id_decorator_js_1.TenantId)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String]),
    __metadata("design:returntype", void 0)
], PurchasesController.prototype, "markAsPaid", null);
exports.PurchasesController = PurchasesController = __decorate([
    (0, swagger_1.ApiTags)('Compras'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('purchases'),
    __metadata("design:paramtypes", [purchases_service_js_1.PurchasesService])
], PurchasesController);
//# sourceMappingURL=purchases.controller.js.map