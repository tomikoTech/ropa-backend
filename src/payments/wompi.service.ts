import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';

export interface WompiTransactionResult {
  id: string;
  status: string;
  reference: string;
  amount_in_cents: number;
  currency: string;
  payment_method_type: string;
  customer_email: string;
}

@Injectable()
export class WompiService {
  private readonly logger = new Logger(WompiService.name);

  private getBaseUrl(publicKey: string): string {
    return publicKey.startsWith('pub_test_')
      ? 'https://sandbox.wompi.co/v1'
      : 'https://production.wompi.co/v1';
  }

  getCheckoutBaseUrl(publicKey: string): string {
    return publicKey.startsWith('pub_test_')
      ? 'https://checkout.wompi.co/p/'
      : 'https://checkout.wompi.co/p/';
  }

  generateIntegritySignature(
    reference: string,
    amountInCents: number,
    currency: string,
    integritySecret: string,
    expirationTime?: string,
  ): string {
    let concat = `${reference}${amountInCents}${currency}`;
    if (expirationTime) concat += expirationTime;
    concat += integritySecret;
    return createHash('sha256').update(concat).digest('hex');
  }

  buildCheckoutUrl(params: {
    publicKey: string;
    integritySecret: string;
    reference: string;
    amountInCents: number;
    currency: string;
    redirectUrl: string;
    customerEmail?: string;
    expirationTime?: string;
  }): { checkoutUrl: string; signature: string } {
    const signature = this.generateIntegritySignature(
      params.reference,
      params.amountInCents,
      params.currency,
      params.integritySecret,
      params.expirationTime,
    );

    const qs = new URLSearchParams();
    qs.set('public-key', params.publicKey);
    qs.set('currency', params.currency);
    qs.set('amount-in-cents', String(params.amountInCents));
    qs.set('reference', params.reference);
    qs.set('signature:integrity', signature);
    qs.set('redirect-url', params.redirectUrl);
    if (params.customerEmail) qs.set('customer-email', params.customerEmail);
    if (params.expirationTime) qs.set('expiration-time', params.expirationTime);

    const checkoutUrl = `${this.getCheckoutBaseUrl(params.publicKey)}?${qs.toString()}`;
    return { checkoutUrl, signature };
  }

  async getTransaction(
    publicKey: string,
    transactionId: string,
  ): Promise<WompiTransactionResult> {
    const url = `${this.getBaseUrl(publicKey)}/transactions/${transactionId}`;
    this.logger.log(`GET ${url}`);

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${publicKey}` },
    });

    if (!res.ok) {
      const text = await res.text();
      this.logger.error(`Wompi GET transaction failed (${res.status}): ${text}`);
      throw new Error(`Error consultando transacción Wompi (${res.status})`);
    }

    const json = await res.json();
    return json.data;
  }

  validateWebhookChecksum(event: any, eventsSecret: string): boolean {
    const { properties, checksum } = event.signature || {};
    const timestamp = event.signature?.timestamp;

    if (!properties || !checksum || timestamp === undefined) {
      this.logger.warn('Webhook missing signature fields');
      return false;
    }

    const values = properties.map((prop: string) =>
      prop.split('.').reduce((obj: any, key: string) => obj?.[key], event.data),
    );

    const concat = values.join('') + timestamp + eventsSecret;
    const computed = createHash('sha256').update(concat).digest('hex').toUpperCase();

    return computed === checksum.toUpperCase();
  }
}
