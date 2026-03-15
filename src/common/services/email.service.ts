import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StoreSettings } from '../../storefront/entities/store-settings.entity.js';

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
  ): Promise<boolean> {
    try {
      const settings = await this.storeSettingsRepo.findOne({
        where: { tenantId },
      });

      if (!settings?.brevoApiKey) {
        this.logger.warn(`No Brevo API key configured for tenant ${tenantId}`);
        return false;
      }

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
            email:
              settings.brevoSenderEmail ||
              `noreply@${settings.storeSlug}.mipinta.shop`,
          },
          to: [{ email: to.email, name: to.name || to.email }],
          subject,
          htmlContent,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        this.logger.error(`Brevo API error: ${response.status} - ${error}`);
        return false;
      }

      this.logger.log(`Email sent to ${to.email}: ${subject}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send email: ${error}`);
      return false;
    }
  }
}
