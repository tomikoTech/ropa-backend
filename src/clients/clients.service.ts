import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Client } from './entities/client.entity.js';
import { CreateClientDto } from './dto/create-client.dto.js';
import { UpdateClientDto } from './dto/update-client.dto.js';

@Injectable()
export class ClientsService {
  constructor(
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
  ) {}

  async create(dto: CreateClientDto, tenantId: string): Promise<Client> {
    if (dto.documentNumber) {
      const existing = await this.clientRepository.findOne({
        where: { documentNumber: dto.documentNumber, tenantId },
      });
      if (existing) {
        throw new ConflictException(
          'Ya existe un cliente con ese número de documento',
        );
      }
    }

    const client = this.clientRepository.create({ ...dto, tenantId });
    return this.clientRepository.save(client);
  }

  async findAll(tenantId: string): Promise<Client[]> {
    return this.clientRepository.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string, tenantId: string): Promise<Client> {
    const client = await this.clientRepository.findOne({
      where: { id, tenantId },
    });
    if (!client) {
      throw new NotFoundException('Cliente no encontrado');
    }
    return client;
  }

  async findGeneric(tenantId: string): Promise<Client> {
    const generic = await this.clientRepository.findOne({
      where: { isGeneric: true, tenantId },
    });
    if (!generic) {
      throw new NotFoundException(
        'Cliente genérico no encontrado. Ejecutar seed.',
      );
    }
    return generic;
  }

  async search(query: string, tenantId: string): Promise<Client[]> {
    return this.clientRepository
      .createQueryBuilder('c')
      .where('c.is_active = true')
      .andWhere('c.tenant_id = :tenantId', { tenantId })
      .andWhere(
        '(c.first_name ILIKE :q OR c.last_name ILIKE :q OR c.document_number ILIKE :q OR c.phone ILIKE :q)',
        { q: `%${query}%` },
      )
      .limit(20)
      .getMany();
  }

  async update(
    id: string,
    dto: UpdateClientDto,
    tenantId: string,
  ): Promise<Client> {
    const client = await this.findOne(id, tenantId);

    if (client.isGeneric) {
      throw new BadRequestException('No se puede editar el cliente genérico');
    }

    if (dto.documentNumber && dto.documentNumber !== client.documentNumber) {
      const existing = await this.clientRepository.findOne({
        where: { documentNumber: dto.documentNumber, tenantId },
      });
      if (existing) {
        throw new ConflictException(
          'Ya existe un cliente con ese número de documento',
        );
      }
    }

    Object.assign(client, dto);
    return this.clientRepository.save(client);
  }

  async remove(id: string, tenantId: string): Promise<void> {
    const client = await this.findOne(id, tenantId);
    if (client.isGeneric) {
      throw new BadRequestException('No se puede eliminar el cliente genérico');
    }
    await this.clientRepository.remove(client);
  }
}
