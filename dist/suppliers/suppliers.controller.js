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
exports.SuppliersController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const suppliers_service_js_1 = require("./suppliers.service.js");
const create_supplier_dto_js_1 = require("./dto/create-supplier.dto.js");
const update_supplier_dto_js_1 = require("./dto/update-supplier.dto.js");
const roles_decorator_js_1 = require("../common/decorators/roles.decorator.js");
const role_enum_js_1 = require("../common/enums/role.enum.js");
const tenant_id_decorator_js_1 = require("../common/decorators/tenant-id.decorator.js");
let SuppliersController = class SuppliersController {
    suppliersService;
    constructor(suppliersService) {
        this.suppliersService = suppliersService;
    }
    create(dto, tenantId) {
        return this.suppliersService.create(dto, tenantId);
    }
    findAll(tenantId) {
        return this.suppliersService.findAll(tenantId);
    }
    search(query, tenantId) {
        return this.suppliersService.search(query || '', tenantId);
    }
    findOne(id, tenantId) {
        return this.suppliersService.findOne(id, tenantId);
    }
    update(id, dto, tenantId) {
        return this.suppliersService.update(id, dto, tenantId);
    }
    remove(id, tenantId) {
        return this.suppliersService.remove(id, tenantId);
    }
};
exports.SuppliersController = SuppliersController;
__decorate([
    (0, common_1.Post)(),
    (0, roles_decorator_js_1.Roles)(role_enum_js_1.Role.ADMIN, role_enum_js_1.Role.BODEGA),
    (0, swagger_1.ApiOperation)({ summary: 'Crear proveedor' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, tenant_id_decorator_js_1.TenantId)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_supplier_dto_js_1.CreateSupplierDto, String]),
    __metadata("design:returntype", void 0)
], SuppliersController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Listar proveedores' }),
    __param(0, (0, tenant_id_decorator_js_1.TenantId)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], SuppliersController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)('search'),
    (0, swagger_1.ApiOperation)({ summary: 'Buscar proveedores' }),
    __param(0, (0, common_1.Query)('q')),
    __param(1, (0, tenant_id_decorator_js_1.TenantId)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], SuppliersController.prototype, "search", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Obtener proveedor por ID' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, tenant_id_decorator_js_1.TenantId)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], SuppliersController.prototype, "findOne", null);
__decorate([
    (0, common_1.Put)(':id'),
    (0, roles_decorator_js_1.Roles)(role_enum_js_1.Role.ADMIN, role_enum_js_1.Role.BODEGA),
    (0, swagger_1.ApiOperation)({ summary: 'Actualizar proveedor' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, tenant_id_decorator_js_1.TenantId)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_supplier_dto_js_1.UpdateSupplierDto, String]),
    __metadata("design:returntype", void 0)
], SuppliersController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, roles_decorator_js_1.Roles)(role_enum_js_1.Role.ADMIN),
    (0, swagger_1.ApiOperation)({ summary: 'Eliminar proveedor' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, tenant_id_decorator_js_1.TenantId)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], SuppliersController.prototype, "remove", null);
exports.SuppliersController = SuppliersController = __decorate([
    (0, swagger_1.ApiTags)('Proveedores'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('suppliers'),
    __metadata("design:paramtypes", [suppliers_service_js_1.SuppliersService])
], SuppliersController);
//# sourceMappingURL=suppliers.controller.js.map