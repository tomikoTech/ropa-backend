import { PurchasesService } from './purchases.service.js';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto.js';
import { ReceiveItemsDto } from './dto/receive-items.dto.js';
import { PurchaseOrderStatus } from '../common/enums/purchase-order-status.enum.js';
export declare class PurchasesController {
    private readonly purchasesService;
    constructor(purchasesService: PurchasesService);
    create(dto: CreatePurchaseOrderDto, user: {
        id: string;
    }, tenantId: string): Promise<import("./entities/purchase-order.entity.js").PurchaseOrder>;
    findAll(tenantId: string, status?: PurchaseOrderStatus, supplierId?: string): Promise<import("./entities/purchase-order.entity.js").PurchaseOrder[]>;
    findAllAccountsPayable(tenantId: string, isPaid?: string): Promise<import("./entities/accounts-payable.entity.js").AccountsPayable[]>;
    findOne(id: string, tenantId: string): Promise<import("./entities/purchase-order.entity.js").PurchaseOrder>;
    send(id: string, tenantId: string): Promise<import("./entities/purchase-order.entity.js").PurchaseOrder>;
    receive(id: string, dto: ReceiveItemsDto, user: {
        id: string;
    }, tenantId: string): Promise<import("./entities/purchase-order.entity.js").PurchaseOrder>;
    cancel(id: string, tenantId: string): Promise<import("./entities/purchase-order.entity.js").PurchaseOrder>;
    markAsPaid(id: string, body: {
        receiptImageUrl?: string;
    }, tenantId: string): Promise<import("./entities/accounts-payable.entity.js").AccountsPayable>;
}
