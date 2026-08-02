import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Brand } from './entities/brand.entity.js';
import { Product } from '../products/entities/product.entity.js';
import { CreateBrandDto } from './dto/create-brand.dto.js';
import { UpdateBrandDto } from './dto/update-brand.dto.js';

@Injectable()
export class BrandsService {
  constructor(
    @InjectRepository(Brand)
    private readonly brandRepo: Repository<Brand>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateBrandDto, tenantId: string): Promise<Brand> {
    const name = dto.name.trim();
    const existing = await this.brandRepo.findOne({ where: { tenantId, name } });
    if (existing) {
      throw new ConflictException('Ya existe una marca con ese nombre');
    }
    const brand = this.brandRepo.create({
      name,
      isActive: dto.isActive ?? true,
      tenantId,
    });
    return this.brandRepo.save(brand);
  }

  /** Lista las marcas con cuántos productos usan cada una. */
  async findAll(
    tenantId: string,
  ): Promise<(Brand & { productCount: number })[]> {
    const brands = await this.brandRepo.find({
      where: { tenantId },
      order: { name: 'ASC' },
    });
    const counts = await this.productRepo
      .createQueryBuilder('p')
      .select('p.brand', 'brand')
      .addSelect('COUNT(*)', 'count')
      .where('p.tenantId = :tenantId', { tenantId })
      .andWhere('p.brand IS NOT NULL')
      .groupBy('p.brand')
      .getRawMany<{ brand: string; count: string }>();
    const byName = new Map(counts.map((c) => [c.brand, Number(c.count)]));
    return brands.map((b) => ({
      ...b,
      productCount: byName.get(b.name) ?? 0,
    }));
  }

  async findOne(id: string, tenantId: string): Promise<Brand> {
    const brand = await this.brandRepo.findOne({ where: { id, tenantId } });
    if (!brand) throw new NotFoundException('Marca no encontrada');
    return brand;
  }

  /**
   * Actualiza la marca. Si cambia el nombre, sincroniza todos los productos
   * que la usaban (Product.brand es texto) dentro de una transacción.
   */
  async update(
    id: string,
    dto: UpdateBrandDto,
    tenantId: string,
  ): Promise<Brand> {
    const brand = await this.findOne(id, tenantId);
    const newName = dto.name?.trim();

    if (newName && newName !== brand.name) {
      const dup = await this.brandRepo.findOne({
        where: { tenantId, name: newName },
      });
      if (dup) throw new ConflictException('Ya existe una marca con ese nombre');

      const oldName = brand.name;
      await this.dataSource.transaction(async (m) => {
        brand.name = newName;
        if (dto.isActive !== undefined) brand.isActive = dto.isActive;
        await m.getRepository(Brand).save(brand);
        await m
          .getRepository(Product)
          .update({ tenantId, brand: oldName }, { brand: newName });
      });
      return brand;
    }

    if (dto.isActive !== undefined) brand.isActive = dto.isActive;
    return this.brandRepo.save(brand);
  }

  /**
   * Elimina la marca y desvincula los productos que la usaban
   * (Product.brand -> null), en una transacción.
   */
  async remove(id: string, tenantId: string): Promise<{ success: true }> {
    const brand = await this.findOne(id, tenantId);
    await this.dataSource.transaction(async (m) => {
      await m
        .getRepository(Product)
        .update({ tenantId, brand: brand.name }, { brand: null as never });
      await m.getRepository(Brand).delete({ id: brand.id, tenantId });
    });
    return { success: true };
  }

  /**
   * Garantiza que exista la marca en el catálogo (sin fallar si ya existe).
   * La usa ProductsService al crear/editar un producto con marca.
   */
  async ensure(name: string | undefined | null, tenantId: string): Promise<void> {
    const n = (name || '').trim();
    if (!n) return;
    const existing = await this.brandRepo.findOne({
      where: { tenantId, name: n },
    });
    if (!existing) {
      await this.brandRepo.save(this.brandRepo.create({ name: n, tenantId }));
    }
  }
}
