import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BotConfig } from './entities/bot-config.entity.js';
import { UpdateBotConfigDto } from './dto/update-bot-config.dto.js';
import { StoreSettings } from './entities/store-settings.entity.js';

@Injectable()
export class BotConfigService {
  constructor(
    @InjectRepository(BotConfig)
    private readonly botConfigRepo: Repository<BotConfig>,
    @InjectRepository(StoreSettings)
    private readonly settingsRepo: Repository<StoreSettings>,
  ) {}

  async getByStoreSlug(storeSlug: string): Promise<BotConfig> {
    let config = await this.botConfigRepo.findOne({ where: { storeSlug } });
    if (!config) {
      // Auto-create with defaults if not exists
      const settings = await this.settingsRepo.findOne({
        where: { storeSlug },
      });
      if (!settings) {
        throw new NotFoundException(`Store ${storeSlug} not found`);
      }
      config = this.botConfigRepo.create({
        storeSlug,
        tenantId: settings.tenantId,
      });
      config = await this.botConfigRepo.save(config);
    }
    return config;
  }

  async getByTenantId(tenantId: string): Promise<BotConfig | null> {
    const settings = await this.settingsRepo.findOne({
      where: { tenantId },
    });
    if (!settings) return null;
    return this.getByStoreSlug(settings.storeSlug);
  }

  async update(
    tenantId: string,
    dto: UpdateBotConfigDto,
  ): Promise<BotConfig> {
    const config = await this.getByTenantId(tenantId);
    if (!config) {
      throw new NotFoundException('Bot config not found for this tenant');
    }

    if (dto.greetingMessage !== undefined) config.greetingMessage = dto.greetingMessage;
    if (dto.aboutResponse !== undefined) config.aboutResponse = dto.aboutResponse;
    if (dto.hoursResponse !== undefined) config.hoursResponse = dto.hoursResponse;
    if (dto.locationResponse !== undefined) config.locationResponse = dto.locationResponse;
    if (dto.outOfStockMessage !== undefined) config.outOfStockMessage = dto.outOfStockMessage;
    if (dto.menuHeader !== undefined) config.menuHeader = dto.menuHeader;
    if (dto.btnProductsLabel !== undefined) config.btnProductsLabel = dto.btnProductsLabel;
    if (dto.btnAboutLabel !== undefined) config.btnAboutLabel = dto.btnAboutLabel;
    if (dto.btnHoursLabel !== undefined) config.btnHoursLabel = dto.btnHoursLabel;
    if (dto.botEnabled !== undefined) config.botEnabled = dto.botEnabled;
    if (dto.whatsappAccessToken !== undefined) config.whatsappAccessToken = dto.whatsappAccessToken;
    if (dto.whatsappPhoneNumberId !== undefined) config.whatsappPhoneNumberId = dto.whatsappPhoneNumberId;

    return this.botConfigRepo.save(config);
  }
}
