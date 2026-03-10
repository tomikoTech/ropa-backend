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
exports.UsersController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const users_service_js_1 = require("./users.service.js");
const create_user_dto_js_1 = require("./dto/create-user.dto.js");
const update_user_dto_js_1 = require("./dto/update-user.dto.js");
const roles_decorator_js_1 = require("../common/decorators/roles.decorator.js");
const roles_guard_js_1 = require("../common/guards/roles.guard.js");
const role_enum_js_1 = require("../common/enums/role.enum.js");
const tenant_id_decorator_js_1 = require("../common/decorators/tenant-id.decorator.js");
let UsersController = class UsersController {
    usersService;
    constructor(usersService) {
        this.usersService = usersService;
    }
    create(createUserDto, tenantId) {
        return this.usersService.create(createUserDto, tenantId);
    }
    findAll(tenantId) {
        return this.usersService.findAll(tenantId);
    }
    findOne(id, tenantId) {
        return this.usersService.findOne(id, tenantId);
    }
    update(id, updateUserDto, tenantId) {
        return this.usersService.update(id, updateUserDto, tenantId);
    }
    remove(id, tenantId) {
        return this.usersService.remove(id, tenantId);
    }
};
exports.UsersController = UsersController;
__decorate([
    (0, common_1.Post)(),
    (0, common_1.UseGuards)(roles_guard_js_1.RolesGuard),
    (0, roles_decorator_js_1.Roles)(role_enum_js_1.Role.ADMIN),
    (0, swagger_1.ApiOperation)({ summary: 'Crear usuario (solo admin)' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, tenant_id_decorator_js_1.TenantId)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_user_dto_js_1.CreateUserDto, String]),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Listar todos los usuarios' }),
    __param(0, (0, tenant_id_decorator_js_1.TenantId)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Obtener usuario por ID' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, tenant_id_decorator_js_1.TenantId)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "findOne", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, common_1.UseGuards)(roles_guard_js_1.RolesGuard),
    (0, roles_decorator_js_1.Roles)(role_enum_js_1.Role.ADMIN),
    (0, swagger_1.ApiOperation)({ summary: 'Actualizar usuario (solo admin)' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, tenant_id_decorator_js_1.TenantId)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_user_dto_js_1.UpdateUserDto, String]),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, common_1.UseGuards)(roles_guard_js_1.RolesGuard),
    (0, roles_decorator_js_1.Roles)(role_enum_js_1.Role.ADMIN),
    (0, swagger_1.ApiOperation)({ summary: 'Eliminar usuario (solo admin)' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, tenant_id_decorator_js_1.TenantId)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "remove", null);
exports.UsersController = UsersController = __decorate([
    (0, swagger_1.ApiTags)('Usuarios'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('users'),
    __metadata("design:paramtypes", [users_service_js_1.UsersService])
], UsersController);
//# sourceMappingURL=users.controller.js.map