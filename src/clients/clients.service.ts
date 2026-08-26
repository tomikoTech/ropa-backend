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
import { Paginated } from '../common/types/paginated.js';
import { armarPaginado, resolverPagina } from '../common/utils/paginacion.js';

@Injectable()
export class ClientsService {
  constructor(
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
  ) {}

  async create(dto: CreateClientDto, tenantId: string): Promise<Client> {
    // Cliente rápido: se admite crear con solo el celular. Debe venir al menos
    // un identificador (nombre, documento o teléfono).
    const firstName = dto.firstName?.trim();
    const phone = dto.phone?.trim();
    if (!firstName && !dto.documentNumber?.trim() && !phone) {
      throw new BadRequestException(
        'Debe indicar al menos un nombre, documento o teléfono',
      );
    }

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

    const client = this.clientRepository.create({
      ...dto,
      // Rellenar nombres si faltan (columnas NOT NULL): usar el teléfono como
      // identificador visible del cliente rápido.
      firstName: firstName || phone || 'Cliente',
      lastName: dto.lastName?.trim() || '',
      tenantId,
    });
    return this.clientRepository.save(client);
  }

  async findAll(tenantId: string): Promise<Client[]> {
    return this.clientRepository.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Clientes por página, con la búsqueda hecha en el servidor.
   *
   * La lista traía todos los clientes del tenant y el navegador filtraba y
   * paginaba encima. En una tienda con miles de clientes eso es una descarga
   * grande por cada visita —y el «sácalo todo en un fetch»—. La búsqueda es la
   * misma que ofrecía la pantalla: nombre, apellido, documento, teléfono o
   * correo.
   */
  async findAllPaginado(
    tenantId: string,
    opts: { page?: string | number; limit?: string | number; search?: string },
  ): Promise<Paginated<Client>> {
    const pagina = resolverPagina(opts, { limitDefault: 50, limitMax: 200 });

    const qb = this.clientRepository
      .createQueryBuilder('c')
      .where('c.tenantId = :tenantId', { tenantId });

    const q = (opts.search ?? '').trim();
    if (q) {
      qb.andWhere(
        `(c.first_name ILIKE :q OR c.last_name ILIKE :q OR
          c.document_number ILIKE :q OR c.phone ILIKE :q OR c.email ILIKE :q OR
          (c.first_name || ' ' || c.last_name) ILIKE :q)`,
        { q: `%${q}%` },
      );
    }

    const [data, total] = await qb
      .orderBy('c.created_at', 'DESC')
      .addOrderBy('c.id', 'ASC')
      .offset(pagina.offset)
      .limit(pagina.limit)
      .getManyAndCount();

    return armarPaginado(data, total, pagina);
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
