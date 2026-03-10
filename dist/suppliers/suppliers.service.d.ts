import { Repository } from 'typeorm';
import { Supplier } from './entities/supplier.entity.js';
import { CreateSupplierDto } from './dto/create-supplier.dto.js';
import { UpdateSupplierDto } from './dto/update-supplier.dto.js';
export declare class SuppliersService {
    private readonly supplierRepository;
    constructor(supplierRepository: Repository<Supplier>);
    create(dto: CreateSupplierDto, tenantId: string): Promise<Supplier>;
    findAll(tenantId: string): Promise<Supplier[]>;
    findOne(id: string, tenantId: string): Promise<Supplier>;
    search(query: string, tenantId: string): Promise<Supplier[]>;
    update(id: string, dto: UpdateSupplierDto, tenantId: string): Promise<Supplier>;
    remove(id: string, tenantId: string): Promise<void>;
}
