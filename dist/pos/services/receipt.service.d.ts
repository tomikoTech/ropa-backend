import { Sale } from '../entities/sale.entity.js';
export interface ReceiptData {
    storeName: string;
    storeNit: string;
    saleNumber: string;
    invoiceNumber: string;
    date: string;
    time: string;
    seller: string;
    client: string;
    clientDocument: string;
    warehouse: string;
    items: {
        name: string;
        sku: string;
        size: string;
        color: string;
        quantity: number;
        unitPrice: number;
        discount: number;
        total: number;
    }[];
    subtotal: number;
    discountAmount: number;
    taxAmount: number;
    total: number;
    payments: {
        method: string;
        amount: number;
        received: number;
        change: number;
        reference?: string;
    }[];
    notes?: string;
}
export declare class ReceiptService {
    generateReceipt(sale: Sale): ReceiptData;
}
