import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Tenant } from './entities/tenant.entity.js';
import { User } from '../users/entities/user.entity.js';
import { Warehouse } from '../inventory/entities/warehouse.entity.js';
import { Client } from '../clients/entities/client.entity.js';
import { StoreSettings } from '../storefront/entities/store-settings.entity.js';
import { Role } from '../common/enums/role.enum.js';
import { DocumentType } from '../common/enums/document-type.enum.js';
import { OnboardStoreDto } from './dto/onboard-store.dto.js';

@Injectable()
export class TenantsService {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    private readonly dataSource: DataSource,
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

  /**
   * One-step store onboarding: creates Tenant + Admin + Warehouse + StoreSettings + Generic Client
   */
  async onboardStore(dto: OnboardStoreDto) {
    const slug = dto.storeName
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    // Check slug uniqueness
    const existingTenant = await this.tenantRepo.findOne({ where: { slug } });
    if (existingTenant) {
      throw new ConflictException(`Ya existe una tienda con slug "${slug}"`);
    }

    // Check email uniqueness
    const userRepo = this.dataSource.getRepository(User);
    const existingUser = await userRepo.findOne({ where: { email: dto.adminEmail } });
    if (existingUser) {
      throw new ConflictException(`El email "${dto.adminEmail}" ya está registrado`);
    }

    return this.dataSource.transaction(async (manager) => {
      const tenantRepo = manager.getRepository(Tenant);
      const uRepo = manager.getRepository(User);
      const warehouseRepo = manager.getRepository(Warehouse);
      const clientRepo = manager.getRepository(Client);
      const settingsRepo = manager.getRepository(StoreSettings);

      // 1. Create Tenant
      const tenant = await tenantRepo.save(
        tenantRepo.create({ name: dto.storeName, slug }),
      );
      const tenantId = tenant.id;

      // 2. Create Admin User
      const passwordHash = await bcrypt.hash(dto.adminPassword, 10);
      const admin = await uRepo.save(
        uRepo.create({
          email: dto.adminEmail,
          passwordHash,
          firstName: 'Admin',
          lastName: dto.storeName,
          role: Role.ADMIN,
          isActive: true,
          tenantId,
        }),
      );

      // 3. Create Default Warehouse
      const warehouse = await warehouseRepo.save(
        warehouseRepo.create({
          name: `${dto.storeName} Principal`,
          code: `${slug.slice(0, 6).toUpperCase()}-01`,
          address: '',
          isPosLocation: true,
          tenantId,
        }),
      );

      // 4. Create Store Settings
      const storeSlug = slug;
      await settingsRepo.save(
        settingsRepo.create({
          storeName: dto.storeName,
          storeSlug,
          heroTitle: dto.storeName.toUpperCase() + '.',
          heroSubtitle: 'TU ESTILO.',
          accentColor: dto.accentColor || '#2563eb',
          whatsappNumber: dto.whatsappNumber || '',
          aboutText: `Bienvenido a ${dto.storeName}.`,
          isStorefrontActive: true,
          defaultWarehouseId: warehouse.id,
          tenantId,
        }),
      );

      // 5. Create Generic Client (Consumidor Final)
      await clientRepo.save(
        clientRepo.create({
          firstName: 'Consumidor',
          lastName: 'Final',
          documentType: DocumentType.CC,
          documentNumber: '0000000000',
          isGeneric: true,
          tenantId,
        }),
      );

      return {
        tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
        admin: { email: admin.email },
        storeSlug,
        warehouse: { id: warehouse.id, name: warehouse.name },
      };
    });
  }
}
