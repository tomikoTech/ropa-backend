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
    // Siguiente = MÁXIMO número de factura existente + 1. Se basa en el número
    // real (no en created_at), porque editar la fecha de una venta puede dejar
    // created_at desordenado respecto al número y causar colisiones (duplicados).
    // Extrae el número inicial de "FE-000714" o "FE-000525-2" (ignora el sufijo).
    const row = await this.dataSource
      .getRepository(Sale)
      .createQueryBuilder('s')
      .select(
        "MAX(CAST(substring(s.invoice_number FROM '^FE-0*([0-9]+)') AS integer))",
        'maxnum',
      )
      .where('s.tenant_id = :tenantId', { tenantId })
      .andWhere("s.invoice_number ~ '^FE-[0-9]+'")
      .getRawOne<{ maxnum: string | null }>();

    const nextNum = (row?.maxnum ? parseInt(row.maxnum, 10) : 0) + 1;
    return `FE-${String(nextNum).padStart(6, '0')}`;
  }
}
