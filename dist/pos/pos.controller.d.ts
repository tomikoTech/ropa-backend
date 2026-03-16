import { PosService } from './pos.service.js';
import { CreateSaleDto } from './dto/create-sale.dto.js';
import { RecordArPaymentDto } from './dto/record-ar-payment.dto.js';
import { SendInvoiceDto } from './dto/send-invoice.dto.js';
import { SaleStatus } from '../common/enums/sale-status.enum.js';
export declare class PosController {
    private readonly posService;
    constructor(posService: PosService);
    createSale(dto: CreateSaleDto, user: {
        id: string;
    }, tenantId: string): Promise<import("./entities/sale.entity.js").Sale>;
    findAll(tenantId: string, status?: SaleStatus, warehouseId?: string, userId?: string, from?: string, to?: string, limit?: string): Promise<import("./entities/sale.entity.js").Sale[]>;
    getDailySummary(tenantId: string, warehouseId?: string): Promise<{
        totalSales: number;
        totalAmount: number;
        totalItems: number;
        byPaymentMethod: Record<string, number>;
    }>;
    findAllAccountsReceivable(tenantId: string, isFullyPaid?: string, clientId?: string): Promise<import("./entities/accounts-receivable.entity.js").AccountsReceivable[]>;
    findOneAccountReceivable(id: string, tenantId: string): Promise<import("./entities/accounts-receivable.entity.js").AccountsReceivable>;
    recordArPayment(id: string, dto: RecordArPaymentDto, tenantId: string): Promise<import("./entities/accounts-receivable.entity.js").AccountsReceivable>;
    getClientAccountSummary(clientId: string, tenantId: string): Promise<{
        totalCredit: number;
        totalPaid: number;
        totalPending: number;
        activeAccounts: number;
    }>;
    findOne(id: string, tenantId: string): Promise<import("./entities/sale.entity.js").Sale>;
    getReceipt(id: string, tenantId: string): Promise<import("./services/receipt.service.js").ReceiptData>;
    sendInvoice(id: string, dto: SendInvoiceDto, tenantId: string): Promise<{
        success: boolean;
        error?: string;
    }>;
    cancelSale(id: string, user: {
        id: string;
    }, tenantId: string): Promise<import("./entities/sale.entity.js").Sale>;
}
