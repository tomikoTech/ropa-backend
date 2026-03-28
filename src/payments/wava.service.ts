import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class WavaService {
  private readonly logger = new Logger(WavaService.name);
  private readonly baseUrl =
    process.env.WAVA_API_BASE_URL || 'https://api.dev.wava.co/v1';

  private async request<T>(
    method: string,
    path: string,
    merchantKey: string,
    body?: unknown,
  ): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'merchant-key': merchantKey,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json();
    if (!res.ok) {
      this.logger.error(`Wava ${method} ${path} failed: ${JSON.stringify(json)}`);
      throw new Error(json.message || json.description || 'Wava API error');
    }
    return json.data ?? json;
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
