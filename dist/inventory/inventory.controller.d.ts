import { InventoryService } from './inventory.service.js';
import { CreateWarehouseDto } from './dto/create-warehouse.dto.js';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto.js';
import { AdjustStockDto } from './dto/adjust-stock.dto.js';
import { TransferStockDto } from './dto/transfer-stock.dto.js';
import { User } from '../users/entities/user.entity.js';
import { MovementType } from '../common/enums/movement-type.enum.js';
export declare class InventoryController {
    private readonly inventoryService;
    constructor(inventoryService: InventoryService);
    createWarehouse(dto: CreateWarehouseDto, tenantId: string): Promise<import("./entities/warehouse.entity.js").Warehouse>;
    findAllWarehouses(tenantId: string): Promise<import("./entities/warehouse.entity.js").Warehouse[]>;
    findWarehouse(id: string, tenantId: string): Promise<import("./entities/warehouse.entity.js").Warehouse>;
    updateWarehouse(id: string, dto: UpdateWarehouseDto, tenantId: string): Promise<import("./entities/warehouse.entity.js").Warehouse>;
    removeWarehouse(id: string, tenantId: string): Promise<void>;
    getAllStock(tenantId: string): Promise<import("./entities/stock.entity.js").Stock[]>;
    getLowStock(tenantId: string): Promise<import("./entities/stock.entity.js").Stock[]>;
    getStockByWarehouse(warehouseId: string, tenantId: string): Promise<import("./entities/stock.entity.js").Stock[]>;
    getStockByVariant(variantId: string, tenantId: string): Promise<import("./entities/stock.entity.js").Stock[]>;
    adjustStock(dto: AdjustStockDto, user: User, tenantId: string): Promise<import("./entities/stock.entity.js").Stock>;
    transferStock(dto: TransferStockDto, user: User, tenantId: string): Promise<{
        from: import("./entities/stock.entity.js").Stock;
        to: import("./entities/stock.entity.js").Stock;
    }>;
    getMovements(tenantId: string, warehouseId?: string, variantId?: string, movementType?: MovementType, limit?: string): Promise<import("./entities/stock-movement.entity.js").StockMovement[]>;
    setMinStock(variantId: string, warehouseId: string, minStock: number, tenantId: string): Promise<import("./entities/stock.entity.js").Stock>;
}
