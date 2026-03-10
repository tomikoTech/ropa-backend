import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Sale } from '../entities/sale.entity.js';

@Injectable()
export class InvoiceService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Generate a sequential sale number: VTA-YYYYMMDD-XXXX
   */
  async generateSaleNumber(tenantId: string): Promise<string> {
    const today = new Date();
    const dateStr =
      today.getFullYear().toString() +
      String(today.getMonth() + 1).padStart(2, '0') +
      String(today.getDate()).padStart(2, '0');

    const prefix = `VTA-${dateStr}-`;

    const lastSale = await this.dataSource
      .getRepository(Sale)
      .createQueryBuilder('s')
      .where('s.sale_number LIKE :prefix', { prefix: `${prefix}%` })
      .andWhere('s.tenant_id = :tenantId', { tenantId })
      .orderBy('s.sale_number', 'DESC')
      .getOne();

    let nextSeq = 1;
    if (lastSale) {
      const lastSeq = parseInt(lastSale.saleNumber.split('-').pop() || '0', 10);
      nextSeq = lastSeq + 1;
    }

    return `${prefix}${String(nextSeq).padStart(4, '0')}`;
  }

  /**
   * Generate a DIAN-style invoice number: FE-XXXXX
   * (Simplified — real DIAN integration would use authorized ranges)
   */
  async generateInvoiceNumber(tenantId: string): Promise<string> {
    const lastSale = await this.dataSource
      .getRepository(Sale)
      .createQueryBuilder('s')
      .where('s.invoice_number IS NOT NULL')
      .andWhere('s.tenant_id = :tenantId', { tenantId })
      .orderBy('s.created_at', 'DESC')
      .getOne();

    let nextNum = 1;
    if (lastSale?.invoiceNumber) {
      const lastNum = parseInt(lastSale.invoiceNumber.replace('FE-', ''), 10);
      nextNum = lastNum + 1;
    }

    return `FE-${String(nextNum).padStart(6, '0')}`;
  }
}
