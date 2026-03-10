import { Repository, DataSource } from 'typeorm';
import { Sale } from './entities/sale.entity.js';
import { SaleItem } from './entities/sale-item.entity.js';
import { Payment } from './entities/payment.entity.js';
import { ProductVariant } from '../products/entities/product-variant.entity.js';
import { Stock } from '../inventory/entities/stock.entity.js';
import { AccountsReceivable } from './entities/accounts-receivable.entity.js';
import { AccountsReceivablePayment } from './entities/accounts-receivable-payment.entity.js';
import { CreateSaleDto } from './dto/create-sale.dto.js';
import { RecordArPaymentDto } from './dto/record-ar-payment.dto.js';
import { TaxService } from './services/tax.service.js';
import { InvoiceService } from './services/invoice.service.js';
import { ReceiptService, ReceiptData } from './services/receipt.service.js';
import { SaleStatus } from '../common/enums/sale-status.enum.js';
export declare class PosService {
    private readonly saleRepository;
    private readonly saleItemRepository;
    private readonly paymentRepository;
    private readonly arRepository;
    private readonly arPaymentRepository;
    private readonly variantRepository;
    private readonly stockRepository;
    private readonly dataSource;
    private readonly taxService;
    private readonly invoiceService;
    private readonly receiptService;
    constructor(saleRepository: Repository<Sale>, saleItemRepository: Repository<SaleItem>, paymentRepository: Repository<Payment>, arRepository: Repository<AccountsReceivable>, arPaymentRepository: Repository<AccountsReceivablePayment>, variantRepository: Repository<ProductVariant>, stockRepository: Repository<Stock>, dataSource: DataSource, taxService: TaxService, invoiceService: InvoiceService, receiptService: ReceiptService);
    createSale(dto: CreateSaleDto, userId: string, tenantId: string): Promise<Sale>;
    findAll(filters: {
        status?: SaleStatus;
        warehouseId?: string;
        userId?: string;
        from?: string;
        to?: string;
        limit?: number;
    } | undefined, tenantId: string): Promise<Sale[]>;
    findOne(id: string, tenantId: string): Promise<Sale>;
    getReceipt(id: string, tenantId: string): Promise<ReceiptData>;
    cancelSale(id: string, userId: string, tenantId: string): Promise<Sale>;
    getDailySummary(warehouseId: string | undefined, tenantId: string): Promise<{
        totalSales: number;
        totalAmount: number;
        totalItems: number;
        byPaymentMethod: Record<string, number>;
    }>;
    findAllAccountsReceivable(filters: {
        isFullyPaid?: boolean;
        clientId?: string;
    } | undefined, tenantId: string): Promise<AccountsReceivable[]>;
    findOneAccountReceivable(id: string, tenantId: string): Promise<AccountsReceivable>;
    recordArPayment(arId: string, dto: RecordArPaymentDto, tenantId: string): Promise<AccountsReceivable>;
    getClientAccountSummary(clientId: string, tenantId: string): Promise<{
        totalCredit: number;
        totalPaid: number;
        totalPending: number;
        activeAccounts: number;
    }>;
}
