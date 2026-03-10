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
exports.CategoriesController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const categories_service_js_1 = require("./categories.service.js");
const create_category_dto_js_1 = require("./dto/create-category.dto.js");
const update_category_dto_js_1 = require("./dto/update-category.dto.js");
const tenant_id_decorator_js_1 = require("../common/decorators/tenant-id.decorator.js");
let CategoriesController = class CategoriesController {
    categoriesService;
    constructor(categoriesService) {
        this.categoriesService = categoriesService;
    }
    create(dto, tenantId) {
        return this.categoriesService.create(dto, tenantId);
    }
    findAll(tenantId) {
        return this.categoriesService.findAll(tenantId);
    }
    findTree(tenantId) {
        return this.categoriesService.findTree(tenantId);
    }
    findOne(id, tenantId) {
        return this.categoriesService.findOne(id, tenantId);
    }
    update(id, dto, tenantId) {
        return this.categoriesService.update(id, dto, tenantId);
    }
    remove(id, tenantId) {
        return this.categoriesService.remove(id, tenantId);
    }
};
exports.CategoriesController = CategoriesController;
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Crear categoría' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, tenant_id_decorator_js_1.TenantId)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_category_dto_js_1.CreateCategoryDto, String]),
    __metadata("design:returntype", void 0)
], CategoriesController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Listar todas las categorías' }),
    __param(0, (0, tenant_id_decorator_js_1.TenantId)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], CategoriesController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)('tree'),
    (0, swagger_1.ApiOperation)({ summary: 'Obtener árbol jerárquico de categorías' }),
    __param(0, (0, tenant_id_decorator_js_1.TenantId)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], CategoriesController.prototype, "findTree", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Obtener categoría por ID' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, tenant_id_decorator_js_1.TenantId)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], CategoriesController.prototype, "findOne", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Actualizar categoría' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, tenant_id_decorator_js_1.TenantId)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_category_dto_js_1.UpdateCategoryDto, String]),
    __metadata("design:returntype", void 0)
], CategoriesController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Eliminar categoría' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, tenant_id_decorator_js_1.TenantId)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], CategoriesController.prototype, "remove", null);
exports.CategoriesController = CategoriesController = __decorate([
    (0, swagger_1.ApiTags)('Categorías'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('categories'),
    __metadata("design:paramtypes", [categories_service_js_1.CategoriesService])
], CategoriesController);
//# sourceMappingURL=categories.controller.js.map