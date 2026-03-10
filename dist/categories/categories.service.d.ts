import { Repository } from 'typeorm';
import { Category } from './entities/category.entity.js';
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { UpdateCategoryDto } from './dto/update-category.dto.js';
export declare class CategoriesService {
    private readonly categoryRepository;
    constructor(categoryRepository: Repository<Category>);
    private slugify;
    create(dto: CreateCategoryDto, tenantId: string): Promise<Category>;
    findAll(tenantId: string): Promise<Category[]>;
    findTree(tenantId: string): Promise<Category[]>;
    findOne(id: string, tenantId: string): Promise<Category>;
    update(id: string, dto: UpdateCategoryDto, tenantId: string): Promise<Category>;
    remove(id: string, tenantId: string): Promise<void>;
}
