import { Injectable, Logger } from '@nestjs/common';
import { EmailService } from './email.service.js';

export interface OrderEmailData {
  orderNumber: string;
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
  shippingCost: number;
  total: number;
}

@Injectable()
export class OrderNotificationEmailService {
  private readonly logger = new Logger(OrderNotificationEmailService.name);

  constructor(private readonly emailService: EmailService) {}

  /** Sends order confirmed email. Fire-and-forget. */
  async sendOrderConfirmed(
    tenantId: string,
    order: OrderEmailData,
    storeName: string,
  ): Promise<void> {
    const html = this.generateStatusHtml(order, storeName, {
      title: 'Tu pedido ha sido confirmado',
      message: `Hemos recibido y confirmado tu pedido <strong>${order.orderNumber}</strong>. Estamos preparandolo para ti.`,
      statusLabel: 'Confirmado',
      statusColor: '#2563eb',
    });
    await this.emailService.sendEmail(
      tenantId,
      { email: order.customerEmail, name: order.customerName },
      `Pedido confirmado ${order.orderNumber} - ${storeName}`,
      html,
    );
  }

  /** Sends order shipped email with optional tracking. Fire-and-forget. */
  async sendOrderShipped(
    tenantId: string,
    order: OrderEmailData,
    storeName: string,
    trackingCode?: string,
    carrier?: string,
  ): Promise<void> {
    let message = `Tu pedido <strong>${order.orderNumber}</strong> ha sido enviado.`;
    if (carrier) {
      message += ` Transportadora: <strong>${carrier}</strong>.`;
    }
    if (trackingCode) {
      message += ` Codigo de rastreo: <strong>${trackingCode}</strong>.`;
    }

    const html = this.generateStatusHtml(order, storeName, {
      title: 'Tu pedido ha sido enviado',
      message,
      statusLabel: 'Enviado',
      statusColor: '#7c3aed',
      extraInfo: trackingCode
        ? `<div style="background:#f5f3ff;border-radius:8px;padding:12px 16px;margin-top:16px;text-align:center">
            <p style="margin:0;font-size:12px;color:#666">Codigo de rastreo</p>
            <p style="margin:4px 0 0;font-size:18px;font-weight:bold;color:#7c3aed;letter-spacing:1px">${trackingCode}</p>
            ${carrier ? `<p style="margin:4px 0 0;font-size:12px;color:#666">${carrier}</p>` : ''}
          </div>`
        : undefined,
    });
    await this.emailService.sendEmail(
      tenantId,
      { email: order.customerEmail, name: order.customerName },
      `Pedido enviado ${order.orderNumber} - ${storeName}`,
      html,
    );
  }

  /** Sends order delivered email. Fire-and-forget. */
  async sendOrderDelivered(
    tenantId: string,
    order: OrderEmailData,
    storeName: string,
  ): Promise<void> {
    const html = this.generateStatusHtml(order, storeName, {
      title: 'Tu pedido ha sido entregado',
      message: `Tu pedido <strong>${order.orderNumber}</strong> ha sido entregado exitosamente. Gracias por tu compra!`,
      statusLabel: 'Entregado',
      statusColor: '#16a34a',
    });
    await this.emailService.sendEmail(
      tenantId,
      { email: order.customerEmail, name: order.customerName },
      `Pedido entregado ${order.orderNumber} - ${storeName}`,
      html,
    );
  }

  /** Sends ready for pickup email. Fire-and-forget. */
  async sendOrderReadyForPickup(
    tenantId: string,
    order: OrderEmailData,
    storeName: string,
  ): Promise<void> {
    const html = this.generateStatusHtml(order, storeName, {
      title: 'Tu pedido esta listo para recoger',
      message: `Tu pedido <strong>${order.orderNumber}</strong> esta listo para que lo recojas en la tienda.`,
      statusLabel: 'Listo para recoger',
      statusColor: '#ea580c',
      extraInfo: `<div style="background:#fff7ed;border-radius:8px;padding:12px 16px;margin-top:16px;text-align:center">
        <p style="margin:0;font-size:13px;color:#c2410c;font-weight:600">Tienes 48 horas para recoger tu pedido</p>
      </div>`,
    });
    await this.emailService.sendEmail(
      tenantId,
      { email: order.customerEmail, name: order.customerName },
      `Pedido listo para recoger ${order.orderNumber} - ${storeName}`,
      html,
    );
  }

  /** Sends order cancelled email. Fire-and-forget. */
  async sendOrderCancelled(
    tenantId: string,
    order: OrderEmailData,
    storeName: string,
  ): Promise<void> {
    const html = this.generateStatusHtml(order, storeName, {
      title: 'Tu pedido ha sido cancelado',
      message: `Tu pedido <strong>${order.orderNumber}</strong> ha sido cancelado. Si tienes alguna pregunta, no dudes en contactarnos.`,
      statusLabel: 'Cancelado',
      statusColor: '#dc2626',
    });
    await this.emailService.sendEmail(
      tenantId,
      { email: order.customerEmail, name: order.customerName },
      `Pedido cancelado ${order.orderNumber} - ${storeName}`,
      html,
    );
  }

  private generateStatusHtml(
    order: OrderEmailData,
    storeName: string,
    opts: {
      title: string;
      message: string;
      statusLabel: string;
      statusColor: string;
      extraInfo?: string;
    },
  ): string {
    const formatPrice = (n: number) =>
      new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0,
      }).format(n);

    const itemsRows = order.items
      .map(
        (item) => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #eee">${item.productName}<br><small style="color:#666">${item.variantInfo}</small></td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${item.quantity}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">${formatPrice(item.unitPrice)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">${formatPrice(item.lineTotal)}</td>
        </tr>`,
      )
      .join('');

    return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333">
      <div style="text-align:center;margin-bottom:24px">
        <h1 style="margin:0;font-size:24px">${storeName}</h1>
      </div>

      <div style="text-align:center;margin-bottom:24px">
        <span style="display:inline-block;padding:6px 16px;border-radius:20px;background:${opts.statusColor};color:#fff;font-size:13px;font-weight:600">${opts.statusLabel}</span>
      </div>

      <div style="text-align:center;margin-bottom:24px">
        <h2 style="margin:0 0 8px;font-size:20px;color:#111">${opts.title}</h2>
        <p style="margin:0;font-size:14px;color:#555">${opts.message}</p>
      </div>

      ${opts.extraInfo || ''}

      <div style="background:#f9f9f9;border-radius:8px;padding:16px;margin:24px 0">
        <table style="width:100%;font-size:14px">
          <tr><td style="color:#666">Pedido:</td><td style="text-align:right;font-weight:bold">${order.orderNumber}</td></tr>
          <tr><td style="color:#666">Cliente:</td><td style="text-align:right">${order.customerName}</td></tr>
        </table>
      </div>

      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:24px">
        <thead>
          <tr style="background:#f3f4f6">
            <th style="padding:10px 12px;text-align:left">Producto</th>
            <th style="padding:10px 12px;text-align:center">Cant.</th>
            <th style="padding:10px 12px;text-align:right">Precio</th>
            <th style="padding:10px 12px;text-align:right">Total</th>
          </tr>
        </thead>
        <tbody>${itemsRows}</tbody>
      </table>

      <table style="width:100%;font-size:14px;margin-bottom:24px">
        <tr><td style="padding:4px 12px;color:#666">Subtotal</td><td style="text-align:right;padding:4px 12px">${formatPrice(order.subtotal)}</td></tr>
        ${order.shippingCost > 0 ? `<tr><td style="padding:4px 12px;color:#666">Envio</td><td style="text-align:right;padding:4px 12px">${formatPrice(order.shippingCost)}</td></tr>` : ''}
        <tr style="font-size:18px;font-weight:bold"><td style="padding:8px 12px;border-top:2px solid #333">Total</td><td style="text-align:right;padding:8px 12px;border-top:2px solid #333">${formatPrice(order.total)}</td></tr>
      </table>

      <p style="text-align:center;color:#999;font-size:12px">
        Este correo fue generado automaticamente por ${storeName}.
      </p>
    </body>
    </html>`;
  }
}
