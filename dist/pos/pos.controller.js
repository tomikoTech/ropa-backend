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
exports.PosController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const pos_service_js_1 = require("./pos.service.js");
const create_sale_dto_js_1 = require("./dto/create-sale.dto.js");
const record_ar_payment_dto_js_1 = require("./dto/record-ar-payment.dto.js");
const current_user_decorator_js_1 = require("../common/decorators/current-user.decorator.js");
const tenant_id_decorator_js_1 = require("../common/decorators/tenant-id.decorator.js");
const sale_status_enum_js_1 = require("../common/enums/sale-status.enum.js");
let PosController = class PosController {
    posService;
    constructor(posService) {
        this.posService = posService;
    }
    createSale(dto, user, tenantId) {
        return this.posService.createSale(dto, user.id, tenantId);
    }
    findAll(tenantId, status, warehouseId, userId, from, to, limit) {
        return this.posService.findAll({
            status,
            warehouseId,
            userId,
            from,
            to,
            limit: limit ? parseInt(limit, 10) : undefined,
        }, tenantId);
    }
    getDailySummary(tenantId, warehouseId) {
        return this.posService.getDailySummary(warehouseId, tenantId);
    }
    findAllAccountsReceivable(tenantId, isFullyPaid, clientId) {
        const filters = {};
        if (isFullyPaid !== undefined)
            filters.isFullyPaid = isFullyPaid === 'true';
        if (clientId)
            filters.clientId = clientId;
        return this.posService.findAllAccountsReceivable(filters, tenantId);
    }
    findOneAccountReceivable(id, tenantId) {
        return this.posService.findOneAccountReceivable(id, tenantId);
    }
    recordArPayment(id, dto, tenantId) {
        return this.posService.recordArPayment(id, dto, tenantId);
    }
    getClientAccountSummary(clientId, tenantId) {
        return this.posService.getClientAccountSummary(clientId, tenantId);
    }
    findOne(id, tenantId) {
        return this.posService.findOne(id, tenantId);
    }
    getReceipt(id, tenantId) {
        return this.posService.getReceipt(id, tenantId);
    }
    cancelSale(id, user, tenantId) {
        return this.posService.cancelSale(id, user.id, tenantId);
    }
};
exports.PosController = PosController;
__decorate([
    (0, common_1.Post)('sales'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_js_1.CurrentUser)()),
    __param(2, (0, tenant_id_decorator_js_1.TenantId)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_sale_dto_js_1.CreateSaleDto, Object, String]),
    __metadata("design:returntype", void 0)
], PosController.prototype, "createSale", null);
__decorate([
    (0, common_1.Get)('sales'),
    __param(0, (0, tenant_id_decorator_js_1.TenantId)()),
    __param(1, (0, common_1.Query)('status')),
    __param(2, (0, common_1.Query)('warehouseId')),
    __param(3, (0, common_1.Query)('userId')),
    __param(4, (0, common_1.Query)('from')),
    __param(5, (0, common_1.Query)('to')),
    __param(6, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, String, String, String]),
    __metadata("design:returntype", void 0)
], PosController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)('sales/daily-summary'),
    __param(0, (0, tenant_id_decorator_js_1.TenantId)()),
    __param(1, (0, common_1.Query)('warehouseId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], PosController.prototype, "getDailySummary", null);
__decorate([
    (0, common_1.Get)('accounts-receivable'),
    (0, swagger_1.ApiOperation)({ summary: 'Listar cuentas por cobrar' }),
    __param(0, (0, tenant_id_decorator_js_1.TenantId)()),
    __param(1, (0, common_1.Query)('isFullyPaid')),
    __param(2, (0, common_1.Query)('clientId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", void 0)
], PosController.prototype, "findAllAccountsReceivable", null);
__decorate([
    (0, common_1.Get)('accounts-receivable/:id'),
    (0, swagger_1.ApiOperation)({ summary: 'Detalle de cuenta por cobrar' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, tenant_id_decorator_js_1.TenantId)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], PosController.prototype, "findOneAccountReceivable", null);
__decorate([
    (0, common_1.Post)('accounts-receivable/:id/payment'),
    (0, swagger_1.ApiOperation)({ summary: 'Registrar abono a cuenta por cobrar' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, tenant_id_decorator_js_1.TenantId)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, record_ar_payment_dto_js_1.RecordArPaymentDto, String]),
    __metadata("design:returntype", void 0)
], PosController.prototype, "recordArPayment", null);
__decorate([
    (0, common_1.Get)('clients/:clientId/account-summary'),
    (0, swagger_1.ApiOperation)({ summary: 'Resumen de cuenta del cliente' }),
    __param(0, (0, common_1.Param)('clientId', common_1.ParseUUIDPipe)),
    __param(1, (0, tenant_id_decorator_js_1.TenantId)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], PosController.prototype, "getClientAccountSummary", null);
__decorate([
    (0, common_1.Get)('sales/:id'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, tenant_id_decorator_js_1.TenantId)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], PosController.prototype, "findOne", null);
__decorate([
    (0, common_1.Get)('sales/:id/receipt'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, tenant_id_decorator_js_1.TenantId)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], PosController.prototype, "getReceipt", null);
__decorate([
    (0, common_1.Post)('sales/:id/cancel'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_js_1.CurrentUser)()),
    __param(2, (0, tenant_id_decorator_js_1.TenantId)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String]),
    __metadata("design:returntype", void 0)
], PosController.prototype, "cancelSale", null);
exports.PosController = PosController = __decorate([
    (0, swagger_1.ApiTags)('pos'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('pos'),
    __metadata("design:paramtypes", [pos_service_js_1.PosService])
], PosController);
//# sourceMappingURL=pos.controller.js.map