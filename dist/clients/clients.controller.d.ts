import { ClientsService } from './clients.service.js';
import { CreateClientDto } from './dto/create-client.dto.js';
import { UpdateClientDto } from './dto/update-client.dto.js';
export declare class ClientsController {
    private readonly clientsService;
    constructor(clientsService: ClientsService);
    create(dto: CreateClientDto, tenantId: string): Promise<import("./entities/client.entity.js").Client>;
    findAll(tenantId: string): Promise<import("./entities/client.entity.js").Client[]>;
    findGeneric(tenantId: string): Promise<import("./entities/client.entity.js").Client>;
    search(query: string, tenantId: string): Promise<import("./entities/client.entity.js").Client[]>;
    findOne(id: string, tenantId: string): Promise<import("./entities/client.entity.js").Client>;
    update(id: string, dto: UpdateClientDto, tenantId: string): Promise<import("./entities/client.entity.js").Client>;
    remove(id: string, tenantId: string): Promise<void>;
}
