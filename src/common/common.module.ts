import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailService } from './services/email.service.js';
import { InvoiceEmailService } from './services/invoice-email.service.js';
import { StoreSettings } from '../storefront/entities/store-settings.entity.js';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([StoreSettings])],
  providers: [EmailService, InvoiceEmailService],
  exports: [EmailService, InvoiceEmailService],
})
export class CommonModule {}
