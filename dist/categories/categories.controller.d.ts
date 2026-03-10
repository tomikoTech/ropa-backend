import { CategoriesService } from './categories.service.js';
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { UpdateCategoryDto } from './dto/update-category.dto.js';
export declare class CategoriesController {
    private readonly categoriesService;
    constructor(categoriesService: CategoriesService);
    create(dto: CreateCategoryDto, tenantId: string): Promise<import("./entities/category.entity.js").Category>;
    findAll(tenantId: string): Promise<import("./entities/category.entity.js").Category[]>;
    findTree(tenantId: string): Promise<import("./entities/category.entity.js").Category[]>;
    findOne(id: string, tenantId: string): Promise<import("./entities/category.entity.js").Category>;
    update(id: string, dto: UpdateCategoryDto, tenantId: string): Promise<import("./entities/category.entity.js").Category>;
    remove(id: string, tenantId: string): Promise<void>;
}
