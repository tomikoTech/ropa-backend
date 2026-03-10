import { Repository, DataSource } from 'typeorm';
import { PurchaseOrder } from './entities/purchase-order.entity.js';
import { PurchaseOrderItem } from './entities/purchase-order-item.entity.js';
import { AccountsPayable } from './entities/accounts-payable.entity.js';
import { ProductVariant } from '../products/entities/product-variant.entity.js';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto.js';
import { ReceiveItemsDto } from './dto/receive-items.dto.js';
import { PurchaseOrderStatus } from '../common/enums/purchase-order-status.enum.js';
export declare class PurchasesService {
    private readonly poRepository;
    private readonly poItemRepository;
    private readonly apRepository;
    private readonly variantRepository;
    private readonly dataSource;
    constructor(poRepository: Repository<PurchaseOrder>, poItemRepository: Repository<PurchaseOrderItem>, apRepository: Repository<AccountsPayable>, variantRepository: Repository<ProductVariant>, dataSource: DataSource);
    private generateOrderNumber;
    create(dto: CreatePurchaseOrderDto, userId: string, tenantId: string): Promise<PurchaseOrder>;
    findAll(filters: {
        status?: PurchaseOrderStatus;
        supplierId?: string;
    } | undefined, tenantId: string): Promise<PurchaseOrder[]>;
    findOne(id: string, tenantId: string): Promise<PurchaseOrder>;
    send(id: string, tenantId: string): Promise<PurchaseOrder>;
    receiveItems(id: string, dto: ReceiveItemsDto, userId: string, tenantId: string): Promise<PurchaseOrder>;
    cancel(id: string, tenantId: string): Promise<PurchaseOrder>;
    findAllAccountsPayable(filters: {
        isPaid?: boolean;
    } | undefined, tenantId: string): Promise<AccountsPayable[]>;
    markAsPaid(apId: string, receiptImageUrl: string | undefined, tenantId: string): Promise<AccountsPayable>;
}
