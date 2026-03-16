import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StoreSettings } from '../../storefront/entities/store-settings.entity.js';

export interface EmailResult {
  success: boolean;
  error?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    @InjectRepository(StoreSettings)
    private readonly storeSettingsRepo: Repository<StoreSettings>,
  ) {}

  async sendEmail(
    tenantId: string,
    to: { email: string; name?: string },
    subject: string,
    htmlContent: string,
  ): Promise<EmailResult> {
    try {
      const settings = await this.storeSettingsRepo.findOne({
        where: { tenantId },
      });

      if (!settings) {
        this.logger.warn(`No store settings for tenant ${tenantId}`);
        return { success: false, error: 'Configuración de tienda no encontrada' };
      }

      if (!settings.brevoApiKey) {
        this.logger.warn(
          `No Brevo API key for tenant ${tenantId} (store: ${settings.storeName})`,
        );
        return { success: false, error: 'API Key de Brevo no configurada' };
      }

      const senderEmail =
        settings.brevoSenderEmail ||
        `noreply@${settings.storeSlug}.mipinta.shop`;

      const keyPreview = settings.brevoApiKey.length > 6
        ? `${settings.brevoApiKey.slice(0, 4)}...${settings.brevoApiKey.slice(-4)}`
        : '***';

      this.logger.log(
        `[EMAIL] tenant=${tenantId} | store=${settings.storeName} | ` +
        `to=${to.email} | from=${senderEmail} | ` +
        `apiKey=${keyPreview} (${settings.brevoApiKey.length} chars)`,
      );

      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': settings.brevoApiKey,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          sender: {
            name: settings.storeName || 'MiPinta',
            email: senderEmail,
          },
          to: [{ email: to.email, name: to.name || to.email }],
          subject,
          htmlContent,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        this.logger.error(`Brevo API error: ${response.status} - ${error}`);
        return {
          success: false,
          error: `Brevo error ${response.status}: ${error}`,
        };
      }

      this.logger.log(`Email sent to ${to.email}: ${subject}`);
      return { success: true };
    } catch (error) {
      this.logger.error(`Failed to send email: ${error}`);
      return { success: false, error: `Error interno: ${error}` };
    }
  }
}
