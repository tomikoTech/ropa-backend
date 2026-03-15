import { Injectable } from '@nestjs/common';
import { EmailService } from './email.service.js';

export interface InvoiceData {
  invoiceNumber?: string;
  orderNumber: string;
  storeName: string;
  customerName: string;
  customerEmail: string;
  items: {
    productName: string;
    variantInfo: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
  paymentMethod?: string;
  date: Date;
}

@Injectable()
export class InvoiceEmailService {
  constructor(private readonly emailService: EmailService) {}

  async sendInvoice(tenantId: string, data: InvoiceData): Promise<boolean> {
    const html = this.generateInvoiceHtml(data);
    return this.emailService.sendEmail(
      tenantId,
      { email: data.customerEmail, name: data.customerName },
      `Factura ${data.invoiceNumber || data.orderNumber} - ${data.storeName}`,
      html,
    );
  }

  private generateInvoiceHtml(data: InvoiceData): string {
    const formatPrice = (n: number) =>
      new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0,
      }).format(n);

    const itemsRows = data.items
      .map(
        (item) => `
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee;">${item.productName}<br><small style="color:#666">${item.variantInfo}</small></td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee; text-align:center">${item.quantity}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee; text-align:right">${formatPrice(item.unitPrice)}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee; text-align:right">${formatPrice(item.lineTotal)}</td>
        </tr>`,
      )
      .join('');

    return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="margin: 0; font-size: 24px;">${data.storeName}</h1>
        <p style="color: #666; margin: 4px 0;">Factura de Venta</p>
      </div>

      <div style="background: #f9f9f9; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
        <table style="width: 100%; font-size: 14px;">
          <tr><td style="color:#666">Factura:</td><td style="text-align:right; font-weight:bold">${data.invoiceNumber || data.orderNumber}</td></tr>
          <tr><td style="color:#666">Fecha:</td><td style="text-align:right">${data.date.toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' })}</td></tr>
          <tr><td style="color:#666">Cliente:</td><td style="text-align:right">${data.customerName}</td></tr>
          ${data.paymentMethod ? `<tr><td style="color:#666">Método:</td><td style="text-align:right">${data.paymentMethod}</td></tr>` : ''}
        </table>
      </div>

      <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 24px;">
        <thead>
          <tr style="background: #f3f4f6;">
            <th style="padding: 10px 12px; text-align:left">Producto</th>
            <th style="padding: 10px 12px; text-align:center">Cant.</th>
            <th style="padding: 10px 12px; text-align:right">Precio</th>
            <th style="padding: 10px 12px; text-align:right">Total</th>
          </tr>
        </thead>
        <tbody>${itemsRows}</tbody>
      </table>

      <table style="width: 100%; font-size: 14px; margin-bottom: 24px;">
        <tr><td style="padding:4px 12px; color:#666">Subtotal</td><td style="text-align:right; padding:4px 12px">${formatPrice(data.subtotal)}</td></tr>
        ${data.discountAmount > 0 ? `<tr><td style="padding:4px 12px; color:#e53e3e">Descuento</td><td style="text-align:right; padding:4px 12px; color:#e53e3e">-${formatPrice(data.discountAmount)}</td></tr>` : ''}
        <tr><td style="padding:4px 12px; color:#666">IVA</td><td style="text-align:right; padding:4px 12px">${formatPrice(data.taxAmount)}</td></tr>
        <tr style="font-size:18px; font-weight:bold"><td style="padding:8px 12px; border-top: 2px solid #333">Total</td><td style="text-align:right; padding:8px 12px; border-top: 2px solid #333">${formatPrice(data.total)}</td></tr>
      </table>

      <p style="text-align:center; color:#999; font-size:12px">
        Gracias por tu compra. Este correo fue generado automáticamente por ${data.storeName}.
      </p>
    </body>
    </html>`;
  }
}
