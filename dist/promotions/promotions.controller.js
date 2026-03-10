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
exports.PromotionsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const promotions_service_js_1 = require("./promotions.service.js");
const create_promotion_dto_js_1 = require("./dto/create-promotion.dto.js");
const update_promotion_dto_js_1 = require("./dto/update-promotion.dto.js");
const tenant_id_decorator_js_1 = require("../common/decorators/tenant-id.decorator.js");
const roles_decorator_js_1 = require("../common/decorators/roles.decorator.js");
const role_enum_js_1 = require("../common/enums/role.enum.js");
let PromotionsController = class PromotionsController {
    promotionsService;
    constructor(promotionsService) {
        this.promotionsService = promotionsService;
    }
    create(dto, tenantId) {
        return this.promotionsService.create(dto, tenantId);
    }
    findAll(tenantId) {
        return this.promotionsService.findAll(tenantId);
    }
    findActive(tenantId) {
        return this.promotionsService.findActive(tenantId);
    }
    findOne(id, tenantId) {
        return this.promotionsService.findOne(id, tenantId);
    }
    update(id, dto, tenantId) {
        return this.promotionsService.update(id, dto, tenantId);
    }
    remove(id, tenantId) {
        return this.promotionsService.remove(id, tenantId);
    }
};
exports.PromotionsController = PromotionsController;
__decorate([
    (0, common_1.Post)(),
    (0, roles_decorator_js_1.Roles)(role_enum_js_1.Role.ADMIN),
    (0, swagger_1.ApiOperation)({ summary: 'Crear promoción' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, tenant_id_decorator_js_1.TenantId)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_promotion_dto_js_1.CreatePromotionDto, String]),
    __metadata("design:returntype", void 0)
], PromotionsController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Listar todas las promociones' }),
    __param(0, (0, tenant_id_decorator_js_1.TenantId)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], PromotionsController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)('active'),
    (0, swagger_1.ApiOperation)({ summary: 'Listar promociones activas vigentes' }),
    __param(0, (0, tenant_id_decorator_js_1.TenantId)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], PromotionsController.prototype, "findActive", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Obtener promoción por ID' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, tenant_id_decorator_js_1.TenantId)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], PromotionsController.prototype, "findOne", null);
__decorate([
    (0, common_1.Put)(':id'),
    (0, roles_decorator_js_1.Roles)(role_enum_js_1.Role.ADMIN),
    (0, swagger_1.ApiOperation)({ summary: 'Actualizar promoción' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, tenant_id_decorator_js_1.TenantId)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_promotion_dto_js_1.UpdatePromotionDto, String]),
    __metadata("design:returntype", void 0)
], PromotionsController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, roles_decorator_js_1.Roles)(role_enum_js_1.Role.ADMIN),
    (0, swagger_1.ApiOperation)({ summary: 'Eliminar promoción' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, tenant_id_decorator_js_1.TenantId)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], PromotionsController.prototype, "remove", null);
exports.PromotionsController = PromotionsController = __decorate([
    (0, swagger_1.ApiTags)('Promociones'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('promotions'),
    __metadata("design:paramtypes", [promotions_service_js_1.PromotionsService])
], PromotionsController);
//# sourceMappingURL=promotions.controller.js.map