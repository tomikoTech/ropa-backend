import { Repository } from 'typeorm';
import { Client } from './entities/client.entity.js';
import { CreateClientDto } from './dto/create-client.dto.js';
import { UpdateClientDto } from './dto/update-client.dto.js';
export declare class ClientsService {
    private readonly clientRepository;
    constructor(clientRepository: Repository<Client>);
    create(dto: CreateClientDto, tenantId: string): Promise<Client>;
    findAll(tenantId: string): Promise<Client[]>;
    findOne(id: string, tenantId: string): Promise<Client>;
    findGeneric(tenantId: string): Promise<Client>;
    search(query: string, tenantId: string): Promise<Client[]>;
    update(id: string, dto: UpdateClientDto, tenantId: string): Promise<Client>;
    remove(id: string, tenantId: string): Promise<void>;
}
