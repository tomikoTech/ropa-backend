import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Supplier } from './entities/supplier.entity.js';
import { CreateSupplierDto } from './dto/create-supplier.dto.js';
import { UpdateSupplierDto } from './dto/update-supplier.dto.js';

@Injectable()
export class SuppliersService {
  constructor(
    @InjectRepository(Supplier)
    private readonly supplierRepository: Repository<Supplier>,
  ) {}

  async create(dto: CreateSupplierDto, tenantId: string): Promise<Supplier> {
    const existing = await this.supplierRepository.findOne({
      where: { nit: dto.nit, tenantId },
    });
    if (existing) {
      throw new ConflictException('Ya existe un proveedor con ese NIT');
    }

    const supplier = this.supplierRepository.create({ ...dto, tenantId });
    return this.supplierRepository.save(supplier);
  }

  async findAll(tenantId: string): Promise<Supplier[]> {
    return this.supplierRepository.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string, tenantId: string): Promise<Supplier> {
    const supplier = await this.supplierRepository.findOne({
      where: { id, tenantId },
    });
    if (!supplier) {
      throw new NotFoundException('Proveedor no encontrado');
    }
    return supplier;
  }

  async search(query: string, tenantId: string): Promise<Supplier[]> {
    return this.supplierRepository
      .createQueryBuilder('s')
      .where('s.is_active = true')
      .andWhere('s.tenant_id = :tenantId', { tenantId })
      .andWhere(
        '(s.name ILIKE :q OR s.nit ILIKE :q OR s.contact_name ILIKE :q)',
        { q: `%${query}%` },
      )
      .limit(20)
      .getMany();
  }

  async update(id: string, dto: UpdateSupplierDto, tenantId: string): Promise<Supplier> {
    const supplier = await this.findOne(id, tenantId);

    if (dto.nit && dto.nit !== supplier.nit) {
      const existing = await this.supplierRepository.findOne({
        where: { nit: dto.nit, tenantId },
      });
      if (existing) {
        throw new ConflictException('Ya existe un proveedor con ese NIT');
      }
    }

    Object.assign(supplier, dto);
    return this.supplierRepository.save(supplier);
  }

  async remove(id: string, tenantId: string): Promise<void> {
    const supplier = await this.findOne(id, tenantId);
    await this.supplierRepository.remove(supplier);
  }
}
