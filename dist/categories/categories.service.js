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
exports.CategoriesService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const category_entity_js_1 = require("./entities/category.entity.js");
let CategoriesService = class CategoriesService {
    categoryRepository;
    constructor(categoryRepository) {
        this.categoryRepository = categoryRepository;
    }
    slugify(text) {
        return text
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '');
    }
    async create(dto, tenantId) {
        const slug = this.slugify(dto.name);
        const existing = await this.categoryRepository.findOne({
            where: [
                { name: dto.name, tenantId },
                { slug, tenantId },
            ],
        });
        if (existing) {
            throw new common_1.ConflictException('Ya existe una categoría con ese nombre');
        }
        if (dto.parentId) {
            const parent = await this.categoryRepository.findOne({
                where: { id: dto.parentId, tenantId },
            });
            if (!parent) {
                throw new common_1.NotFoundException('Categoría padre no encontrada');
            }
        }
        const category = this.categoryRepository.create({
            name: dto.name,
            slug,
            description: dto.description,
            parentId: dto.parentId || null,
            sortOrder: dto.sortOrder ?? 0,
            isActive: dto.isActive ?? true,
            tenantId,
        });
        return this.categoryRepository.save(category);
    }
    async findAll(tenantId) {
        return this.categoryRepository.find({
            where: { tenantId },
            relations: ['parent', 'children'],
            order: { sortOrder: 'ASC', name: 'ASC' },
        });
    }
    async findTree(tenantId) {
        return this.categoryRepository.find({
            where: { parentId: null, tenantId },
            relations: ['children', 'children.children'],
            order: { sortOrder: 'ASC', name: 'ASC' },
        });
    }
    async findOne(id, tenantId) {
        const category = await this.categoryRepository.findOne({
            where: { id, tenantId },
            relations: ['parent', 'children'],
        });
        if (!category) {
            throw new common_1.NotFoundException('Categoría no encontrada');
        }
        return category;
    }
    async update(id, dto, tenantId) {
        const category = await this.findOne(id, tenantId);
        if (dto.name && dto.name !== category.name) {
            const slug = this.slugify(dto.name);
            const existing = await this.categoryRepository.findOne({
                where: [
                    { name: dto.name, tenantId },
                    { slug, tenantId },
                ],
            });
            if (existing && existing.id !== id) {
                throw new common_1.ConflictException('Ya existe una categoría con ese nombre');
            }
            category.name = dto.name;
            category.slug = slug;
        }
        if (dto.parentId !== undefined) {
            if (dto.parentId === id) {
                throw new common_1.ConflictException('Una categoría no puede ser su propio padre');
            }
            if (dto.parentId) {
                const parent = await this.categoryRepository.findOne({
                    where: { id: dto.parentId, tenantId },
                });
                if (!parent) {
                    throw new common_1.NotFoundException('Categoría padre no encontrada');
                }
            }
            category.parentId = dto.parentId;
        }
        if (dto.description !== undefined)
            category.description = dto.description;
        if (dto.sortOrder !== undefined)
            category.sortOrder = dto.sortOrder;
        if (dto.isActive !== undefined)
            category.isActive = dto.isActive;
        return this.categoryRepository.save(category);
    }
    async reorder(orderedIds, tenantId) {
        for (let i = 0; i < orderedIds.length; i++) {
            await this.categoryRepository.update({ id: orderedIds[i], tenantId }, { sortOrder: i });
        }
    }
    async remove(id, tenantId) {
        const category = await this.findOne(id, tenantId);
        await this.categoryRepository.remove(category);
    }
};
exports.CategoriesService = CategoriesService;
exports.CategoriesService = CategoriesService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(category_entity_js_1.Category)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], CategoriesService);
//# sourceMappingURL=categories.service.js.map