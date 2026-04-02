import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class WavaService {
  private readonly logger = new Logger(WavaService.name);
  private readonly baseUrl =
    process.env.WAVA_API_BASE_URL || 'https://api.dev.wava.co/v1';
  private readonly partnerApiKey = process.env.WAVA_PARTNER_API_KEY || '';
  private readonly partnerSecret = process.env.WAVA_PARTNER_SECRET || '';

  private async request<T>(
    method: string,
    path: string,
    merchantKey: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    this.logger.log(`Wava ${method} ${url}`);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'merchant-key': merchantKey,
    };

    // Add partner headers if configured (multi-store mode)
    if (this.partnerApiKey && this.partnerSecret) {
      headers['X-API-Key'] = this.partnerApiKey;
      headers['X-API-Secret'] = this.partnerSecret;
    }

    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      this.logger.error(`Wava ${method} ${path} network error: ${err}`);
      throw new Error('No se pudo conectar con el servicio de pagos. Intenta de nuevo.');
    }

    const text = await res.text();

    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      this.logger.error(`Wava ${method} ${path} non-JSON (HTTP ${res.status}): ${text.slice(0, 300)}`);
      throw new Error(`Servicio de pagos no disponible (HTTP ${res.status}). Intenta más tarde.`);
    }

    if (!res.ok) {
      this.logger.error(`Wava ${method} ${path} failed (HTTP ${res.status}): ${JSON.stringify(json)}`);
      throw new Error(json.message || json.description || `Error del servicio de pagos (${res.status})`);
    }

    return json.result ?? json.data ?? json;
  }

  async getPaymentGateways(merchantKey: string) {
    return this.request<any>('GET', '/orders/paymentGateways', merchantKey);
  }

  async createPaymentLink(
    merchantKey: string,
    data: {
      description: string;
      amount: number;
      currency?: string;
      order_key?: string;
      redirect_link?: string;
      redirect_link_cancel?: string;
      redirect_link_failure?: string;
    },
  ) {
    return this.request<any>('POST', '/links', merchantKey, data);
  }

  async createOrder(merchantKey: string, data: any) {
    return this.request<any>('POST', '/orders', merchantKey, data);
  }

  async getOrder(merchantKey: string, orderId: string) {
    return this.request<any>('GET', `/orders/${orderId}`, merchantKey);
  }

  async submitDaviplataOtp(
    merchantKey: string,
    orderId: string,
    otp: string,
  ) {
    return this.request<any>(
      'POST',
      `/orders/daviplata/${orderId}`,
      merchantKey,
      { daviplata_otp: otp },
    );
  }
}
