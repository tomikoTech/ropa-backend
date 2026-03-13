import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from './entities/category.entity.js';
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { UpdateCategoryDto } from './dto/update-category.dto.js';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
  ) {}

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  async create(dto: CreateCategoryDto, tenantId: string): Promise<Category> {
    const slug = this.slugify(dto.name);

    const existing = await this.categoryRepository.findOne({
      where: [
        { name: dto.name, tenantId },
        { slug, tenantId },
      ],
    });
    if (existing) {
      throw new ConflictException('Ya existe una categoría con ese nombre');
    }

    if (dto.parentId) {
      const parent = await this.categoryRepository.findOne({
        where: { id: dto.parentId, tenantId },
      });
      if (!parent) {
        throw new NotFoundException('Categoría padre no encontrada');
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

  async findAll(tenantId: string): Promise<Category[]> {
    return this.categoryRepository.find({
      where: { tenantId },
      relations: ['parent', 'children'],
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
  }

  async findTree(tenantId: string): Promise<Category[]> {
    return this.categoryRepository.find({
      where: { parentId: null as any, tenantId },
      relations: ['children', 'children.children'],
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
  }

  async findOne(id: string, tenantId: string): Promise<Category> {
    const category = await this.categoryRepository.findOne({
      where: { id, tenantId },
      relations: ['parent', 'children'],
    });
    if (!category) {
      throw new NotFoundException('Categoría no encontrada');
    }
    return category;
  }

  async update(
    id: string,
    dto: UpdateCategoryDto,
    tenantId: string,
  ): Promise<Category> {
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
        throw new ConflictException('Ya existe una categoría con ese nombre');
      }
      category.name = dto.name;
      category.slug = slug;
    }

    if (dto.parentId !== undefined) {
      if (dto.parentId === id) {
        throw new ConflictException(
          'Una categoría no puede ser su propio padre',
        );
      }
      if (dto.parentId) {
        const parent = await this.categoryRepository.findOne({
          where: { id: dto.parentId, tenantId },
        });
        if (!parent) {
          throw new NotFoundException('Categoría padre no encontrada');
        }
      }
      category.parentId = dto.parentId;
    }

    if (dto.description !== undefined) category.description = dto.description;
    if (dto.sortOrder !== undefined) category.sortOrder = dto.sortOrder;
    if (dto.isActive !== undefined) category.isActive = dto.isActive;

    return this.categoryRepository.save(category);
  }

  async remove(id: string, tenantId: string): Promise<void> {
    const category = await this.findOne(id, tenantId);
    await this.categoryRepository.remove(category);
  }
}
