import { Repository, DataSource } from 'typeorm';
import { Warehouse } from './entities/warehouse.entity.js';
import { Stock } from './entities/stock.entity.js';
import { StockMovement } from './entities/stock-movement.entity.js';
import { CreateWarehouseDto } from './dto/create-warehouse.dto.js';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto.js';
import { AdjustStockDto } from './dto/adjust-stock.dto.js';
import { TransferStockDto } from './dto/transfer-stock.dto.js';
import { MovementType } from '../common/enums/movement-type.enum.js';
export declare class InventoryService {
    private readonly warehouseRepository;
    private readonly stockRepository;
    private readonly movementRepository;
    private readonly dataSource;
    constructor(warehouseRepository: Repository<Warehouse>, stockRepository: Repository<Stock>, movementRepository: Repository<StockMovement>, dataSource: DataSource);
    createWarehouse(dto: CreateWarehouseDto, tenantId: string): Promise<Warehouse>;
    findAllWarehouses(tenantId: string): Promise<Warehouse[]>;
    findWarehouse(id: string, tenantId: string): Promise<Warehouse>;
    updateWarehouse(id: string, dto: UpdateWarehouseDto, tenantId: string): Promise<Warehouse>;
    removeWarehouse(id: string, tenantId: string): Promise<void>;
    getStockByWarehouse(warehouseId: string, tenantId: string): Promise<Stock[]>;
    getStockByVariant(variantId: string, tenantId: string): Promise<Stock[]>;
    getAllStock(tenantId: string): Promise<Stock[]>;
    getLowStock(tenantId: string): Promise<Stock[]>;
    private getOrCreateStock;
    adjustStock(dto: AdjustStockDto, userId: string, tenantId: string): Promise<Stock>;
    transferStock(dto: TransferStockDto, userId: string, tenantId: string): Promise<{
        from: Stock;
        to: Stock;
    }>;
    getMovements(tenantId: string, filters?: {
        warehouseId?: string;
        variantId?: string;
        movementType?: MovementType;
        limit?: number;
    }): Promise<StockMovement[]>;
    setMinStock(variantId: string, warehouseId: string, minStock: number, tenantId: string): Promise<Stock>;
}
