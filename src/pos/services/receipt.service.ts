import { Injectable } from '@nestjs/common';
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

@Injectable()
export class ReceiptService {
  /**
   * Generate structured receipt data from a completed sale.
   */
  generateReceipt(sale: Sale): ReceiptData {
    const saleDate = new Date(sale.createdAt);

    return {
      storeName: 'TOMIKO ROPA',
      storeNit: '900.000.000-0',
      saleNumber: sale.saleNumber,
      invoiceNumber: sale.invoiceNumber || '',
      date: saleDate.toLocaleDateString('es-CO'),
      time: saleDate.toLocaleTimeString('es-CO'),
      seller: sale.user
        ? `${sale.user.firstName} ${sale.user.lastName}`
        : '',
      client: sale.client
        ? `${sale.client.firstName} ${sale.client.lastName}`
        : 'Consumidor Final',
      clientDocument: sale.client?.documentNumber || '',
      warehouse: sale.warehouse?.name || '',
      items: (sale.items || []).map((item) => ({
        name: item.productName,
        sku: item.variantSku,
        size: item.variantSize,
        color: item.variantColor,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        discount: Number(item.discountPercent),
        total: Number(item.lineTotal),
      })),
      subtotal: Number(sale.subtotal),
      discountAmount: Number(sale.discountAmount),
      taxAmount: Number(sale.taxAmount),
      total: Number(sale.total),
      payments: (sale.payments || []).map((p) => ({
        method: p.method,
        amount: Number(p.amount),
        received: Number(p.receivedAmount),
        change: Number(p.changeAmount),
        reference: p.reference || undefined,
      })),
      notes: sale.notes || undefined,
    };
  }
}
