import { DataSource } from 'typeorm';
export declare class InvoiceService {
    private readonly dataSource;
    constructor(dataSource: DataSource);
    generateSaleNumber(tenantId: string): Promise<string>;
    generateInvoiceNumber(tenantId: string): Promise<string>;
}
