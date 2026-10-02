import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Client } from './entities/client.entity.js';
import {
  claveDelNombre,
  planDeFusion,
  TABLAS_QUE_APUNTAN_AL_CLIENTE,
} from './fusionar-clientes.js';
import { CreateClientDto } from './dto/create-client.dto.js';
import { UpdateClientDto } from './dto/update-client.dto.js';
import { Paginated } from '../common/types/paginated.js';
import { armarPaginado, resolverPagina } from '../common/utils/paginacion.js';

@Injectable()
export class ClientsService {
  constructor(
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
    private readonly dataSource: DataSource,
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
    // El mismo nombre sin documento que los distinga es, casi siempre, la
    // misma persona dos veces: así nacieron 56 parejas en Distri Amber. Se
    // frena y se dice cuál es la ficha existente; si de verdad son dos
    // personas, un documento o un teléfono distinto las separa.
    if (firstName && !dto.documentNumber?.trim()) {
      const repetido = await this.conElMismoNombre(tenantId, {
        firstName,
        lastName: dto.lastName ?? null,
      });
      if (repetido && (!phone || !repetido.phone || repetido.phone === phone)) {
        throw new ConflictException(
          `Ya existe un cliente llamado «${[repetido.firstName, repetido.lastName].filter(Boolean).join(' ')}». ` +
            'Úsalo, o agrégale documento o teléfono a este para distinguirlos.',
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

  /** La ficha de la tienda con el mismo nombre normalizado, si la hay. */
  private async conElMismoNombre(
    tenantId: string,
    nombre: { firstName: string | null; lastName: string | null },
  ): Promise<Client | null> {
    const clave = claveDelNombre(nombre);
    if (!clave) return null;
    // Se traen por la primera palabra tal como se escribió (Postgres no tiene
    // `unaccent` acá) y se compara en memoria con la clave normalizada.
    const primera = (nombre.firstName ?? '').trim().split(/\s+/)[0] ?? '';
    if (!primera) return null;
    const candidatos = await this.clientRepository
      .createQueryBuilder('c')
      .where('c.tenant_id = :tenantId', { tenantId })
      .andWhere('c.is_generic = false')
      .andWhere('(c.first_name ILIKE :patron OR c.last_name ILIKE :patron)', {
        patron: `%${primera}%`,
      })
      .getMany();
    return candidatos.find((c) => claveDelNombre(c) === clave) ?? null;
  }

  /**
   * Fusiona dos fichas del mismo cliente: todo lo del absorbido pasa al que
   * sobrevive y el absorbido desaparece.
   *
   * Mueve ventas, cartera, cotizaciones, apartados y devoluciones en una sola
   * transacción, y completa teléfono, dirección, correo o documento si el
   * sobreviviente no los tenía. La deuda total no cambia: solo cambia a
   * nombre de quién está, que es lo que se comprueba en el e2e.
   */
  async fusionar(
    sobreviveId: string,
    absorbidoId: string,
    tenantId: string,
  ): Promise<{ sobrevive: Client; movidos: Record<string, number> }> {
    if (sobreviveId === absorbidoId) {
      throw new BadRequestException(
        'Un cliente no se puede fusionar consigo mismo',
      );
    }
    const sobrevive = await this.findOne(sobreviveId, tenantId);
    const absorbido = await this.findOne(absorbidoId, tenantId);
    const plan = planDeFusion([sobrevive, absorbido]);
    const movidos: Record<string, number> = {};
    await this.dataSource.transaction(async (m) => {
      for (const tabla of TABLAS_QUE_APUNTAN_AL_CLIENTE) {
        const r: unknown = await m.query(
          `UPDATE "${tabla}" SET client_id = $1 WHERE client_id = $2 AND tenant_id = $3`,
          [sobreviveId, absorbidoId, tenantId],
        );
        // pg devuelve [filas, cantidad] en los UPDATE.
        movidos[tabla] = Array.isArray(r) ? Number(r[1] ?? 0) : 0;
      }
      if (Object.keys(plan.completar).length) {
        await m
          .getRepository(Client)
          .update({ id: sobreviveId, tenantId }, plan.completar);
      }
      await m.getRepository(Client).delete({ id: absorbidoId, tenantId });
    });
    return { sobrevive: await this.findOne(sobreviveId, tenantId), movidos };
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
