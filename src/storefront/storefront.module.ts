import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { StoreSettings } from './entities/store-settings.entity.js';
import { EcommerceOrder } from './entities/ecommerce-order.entity.js';
import { EcommerceOrderItem } from './entities/ecommerce-order-item.entity.js';
import { EcommerceCustomer } from './entities/ecommerce-customer.entity.js';
import { Product } from '../products/entities/product.entity.js';
import { ProductVariant } from '../products/entities/product-variant.entity.js';
import { Category } from '../categories/entities/category.entity.js';
import { Stock } from '../inventory/entities/stock.entity.js';
import { StockMovement } from '../inventory/entities/stock-movement.entity.js';
import { Promotion } from '../promotions/entities/promotion.entity.js';
import { BotConfig } from './entities/bot-config.entity.js';
import { BotConversation } from './entities/bot-conversation.entity.js';
import { BotMessage } from './entities/bot-message.entity.js';
import { StorefrontController } from './storefront.controller.js';
import { StorefrontService } from './storefront.service.js';
import { StoreSettingsController } from './store-settings.controller.js';
import { StoreSettingsService } from './store-settings.service.js';
import { CustomerAuthController } from './customer-auth.controller.js';
import { CustomerAuthService } from './customer-auth.service.js';
import { JwtCustomerStrategy } from './strategies/jwt-customer.strategy.js';
import { BotConfigController } from './bot-config.controller.js';
import { BotConfigService } from './bot-config.service.js';
import { BotChatController } from './bot-chat.controller.js';
import { BotChatService } from './bot-chat.service.js';
import { TaxService } from '../pos/services/tax.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      StoreSettings,
      EcommerceOrder,
      EcommerceOrderItem,
      EcommerceCustomer,
      Product,
      ProductVariant,
      Category,
      Stock,
      StockMovement,
      Promotion,
      BotConfig,
      BotConversation,
      BotMessage,
    ]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('jwt.secret')!,
        signOptions: {
          expiresIn: configService.get<string>('jwt.expiration')! as any,
        },
      }),
    }),
  ],
  controllers: [StorefrontController, StoreSettingsController, CustomerAuthController, BotConfigController, BotChatController],
  providers: [
    StorefrontService,
    StoreSettingsService,
    CustomerAuthService,
    BotConfigService,
    BotChatService,
    JwtCustomerStrategy,
    TaxService,
  ],
  exports: [StoreSettingsService],
})
export class StorefrontModule {}
