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
exports.ReturnsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const returns_service_js_1 = require("./returns.service.js");
const create_return_dto_js_1 = require("./dto/create-return.dto.js");
const current_user_decorator_js_1 = require("../common/decorators/current-user.decorator.js");
const tenant_id_decorator_js_1 = require("../common/decorators/tenant-id.decorator.js");
const roles_decorator_js_1 = require("../common/decorators/roles.decorator.js");
const role_enum_js_1 = require("../common/enums/role.enum.js");
let ReturnsController = class ReturnsController {
    returnsService;
    constructor(returnsService) {
        this.returnsService = returnsService;
    }
    create(dto, user, tenantId) {
        return this.returnsService.create(dto, user.id, tenantId);
    }
    findAll(tenantId) {
        return this.returnsService.findAll(tenantId);
    }
    findCreditNotes(tenantId) {
        return this.returnsService.findCreditNotes(tenantId);
    }
    findOne(id, tenantId) {
        return this.returnsService.findOne(id, tenantId);
    }
};
exports.ReturnsController = ReturnsController;
__decorate([
    (0, common_1.Post)(),
    (0, roles_decorator_js_1.Roles)(role_enum_js_1.Role.ADMIN, role_enum_js_1.Role.VENTAS),
    (0, swagger_1.ApiOperation)({ summary: 'Crear devolución' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_js_1.CurrentUser)()),
    __param(2, (0, tenant_id_decorator_js_1.TenantId)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_return_dto_js_1.CreateReturnDto, Object, String]),
    __metadata("design:returntype", void 0)
], ReturnsController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Listar devoluciones' }),
    __param(0, (0, tenant_id_decorator_js_1.TenantId)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ReturnsController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)('credit-notes'),
    (0, swagger_1.ApiOperation)({ summary: 'Listar notas crédito' }),
    __param(0, (0, tenant_id_decorator_js_1.TenantId)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ReturnsController.prototype, "findCreditNotes", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Obtener devolución por ID' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, tenant_id_decorator_js_1.TenantId)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], ReturnsController.prototype, "findOne", null);
exports.ReturnsController = ReturnsController = __decorate([
    (0, swagger_1.ApiTags)('Devoluciones'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('returns'),
    __metadata("design:paramtypes", [returns_service_js_1.ReturnsService])
], ReturnsController);
//# sourceMappingURL=returns.controller.js.map