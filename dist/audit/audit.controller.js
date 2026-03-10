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
exports.AuditController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const audit_service_js_1 = require("./audit.service.js");
const tenant_id_decorator_js_1 = require("../common/decorators/tenant-id.decorator.js");
const roles_decorator_js_1 = require("../common/decorators/roles.decorator.js");
const role_enum_js_1 = require("../common/enums/role.enum.js");
let AuditController = class AuditController {
    auditService;
    constructor(auditService) {
        this.auditService = auditService;
    }
    findAll(tenantId, entityType, userId, action, from, to, limit) {
        return this.auditService.findAll({
            entityType,
            userId,
            action,
            from,
            to,
            limit: limit ? parseInt(limit, 10) : undefined,
        }, tenantId);
    }
};
exports.AuditController = AuditController;
__decorate([
    (0, common_1.Get)(),
    (0, roles_decorator_js_1.Roles)(role_enum_js_1.Role.ADMIN),
    (0, swagger_1.ApiOperation)({ summary: 'Listar logs de auditoría' }),
    __param(0, (0, tenant_id_decorator_js_1.TenantId)()),
    __param(1, (0, common_1.Query)('entityType')),
    __param(2, (0, common_1.Query)('userId')),
    __param(3, (0, common_1.Query)('action')),
    __param(4, (0, common_1.Query)('from')),
    __param(5, (0, common_1.Query)('to')),
    __param(6, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, String, String, String]),
    __metadata("design:returntype", void 0)
], AuditController.prototype, "findAll", null);
exports.AuditController = AuditController = __decorate([
    (0, swagger_1.ApiTags)('Auditoría'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('audit'),
    __metadata("design:paramtypes", [audit_service_js_1.AuditService])
], AuditController);
//# sourceMappingURL=audit.controller.js.map