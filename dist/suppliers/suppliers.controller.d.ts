import { SuppliersService } from './suppliers.service.js';
import { CreateSupplierDto } from './dto/create-supplier.dto.js';
import { UpdateSupplierDto } from './dto/update-supplier.dto.js';
export declare class SuppliersController {
    private readonly suppliersService;
    constructor(suppliersService: SuppliersService);
    create(dto: CreateSupplierDto, tenantId: string): Promise<import("./entities/supplier.entity.js").Supplier>;
    findAll(tenantId: string): Promise<import("./entities/supplier.entity.js").Supplier[]>;
    search(query: string, tenantId: string): Promise<import("./entities/supplier.entity.js").Supplier[]>;
    findOne(id: string, tenantId: string): Promise<import("./entities/supplier.entity.js").Supplier>;
    update(id: string, dto: UpdateSupplierDto, tenantId: string): Promise<import("./entities/supplier.entity.js").Supplier>;
    remove(id: string, tenantId: string): Promise<void>;
}
