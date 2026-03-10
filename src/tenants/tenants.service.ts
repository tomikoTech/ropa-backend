import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from './entities/tenant.entity.js';

@Injectable()
export class TenantsService {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
  ) {}

  async create(data: { name: string; slug: string }): Promise<Tenant> {
    const existing = await this.tenantRepo.findOne({ where: { slug: data.slug } });
    if (existing) {
      throw new ConflictException('Slug ya existe');
    }
    return this.tenantRepo.save(this.tenantRepo.create(data));
  }

  async findAll(): Promise<Tenant[]> {
    return this.tenantRepo.find({ order: { createdAt: 'DESC' } });
  }

  async findOne(id: string): Promise<Tenant> {
    const tenant = await this.tenantRepo.findOne({ where: { id } });
    if (!tenant) throw new NotFoundException('Tenant no encontrado');
    return tenant;
  }

  async update(id: string, data: Partial<{ name: string; slug: string; isActive: boolean }>): Promise<Tenant> {
    const tenant = await this.findOne(id);
    Object.assign(tenant, data);
    return this.tenantRepo.save(tenant);
  }

  async remove(id: string): Promise<void> {
    const tenant = await this.findOne(id);
    await this.tenantRepo.remove(tenant);
  }
}
