import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BotConversation } from './entities/bot-conversation.entity.js';
import { BotMessage } from './entities/bot-message.entity.js';
import { BotConfig } from './entities/bot-config.entity.js';

const META_GRAPH_URL = 'https://graph.facebook.com/v21.0';

@Injectable()
export class BotChatService {
  constructor(
    @InjectRepository(BotConversation)
    private readonly conversationRepo: Repository<BotConversation>,
    @InjectRepository(BotMessage)
    private readonly messageRepo: Repository<BotMessage>,
    @InjectRepository(BotConfig)
    private readonly botConfigRepo: Repository<BotConfig>,
  ) {}

  // --- Conversations ---

  async getActiveConversations(tenantId: string): Promise<BotConversation[]> {
    return this.conversationRepo.find({
      where: { tenantId, status: 'active' },
      order: { updatedAt: 'DESC' },
      relations: ['messages'],
    });
  }

  async getAllConversations(tenantId: string): Promise<BotConversation[]> {
    return this.conversationRepo.find({
      where: { tenantId },
      order: { updatedAt: 'DESC' },
    });
  }

  async getConversation(tenantId: string, id: string): Promise<BotConversation> {
    const conv = await this.conversationRepo.findOne({
      where: { id, tenantId },
      relations: ['messages'],
    });
    if (!conv) throw new NotFoundException('Conversation not found');
    return conv;
  }

  async getMessages(tenantId: string, conversationId: string): Promise<BotMessage[]> {
    const conv = await this.conversationRepo.findOne({
      where: { id: conversationId, tenantId },
    });
    if (!conv) throw new NotFoundException('Conversation not found');

    return this.messageRepo.find({
      where: { conversationId },
      order: { createdAt: 'ASC' },
    });
  }

  // --- Called by the bot (public endpoint) ---

  async createConversation(data: {
    tenantId: string;
    storeSlug: string;
    customerPhone: string;
    customerName?: string;
    escalationReason?: string;
    escalationSummary?: string;
    messages?: Array<{ senderType: string; content: string }>;
  }): Promise<BotConversation> {
    // Check if there's already an active conversation for this phone
    const existing = await this.conversationRepo.findOne({
      where: {
        tenantId: data.tenantId,
        customerPhone: data.customerPhone,
        status: 'active',
      },
    });
    if (existing) return existing;

    const conv = new BotConversation();
    conv.tenantId = data.tenantId;
    conv.storeSlug = data.storeSlug;
    conv.customerPhone = data.customerPhone;
    conv.customerName = data.customerName || null as any;
    conv.status = 'active';
    conv.escalationReason = data.escalationReason || null as any;
    conv.escalationSummary = data.escalationSummary || null as any;
    const saved = await this.conversationRepo.save(conv);

    // Save initial messages (conversation history from bot)
    if (data.messages?.length) {
      const msgs = data.messages.map((m) =>
        this.messageRepo.create({
          conversationId: saved.id,
          senderType: m.senderType,
          content: m.content,
        }),
      );
      await this.messageRepo.save(msgs);
    }

    return saved;
  }

  async addMessage(data: {
    tenantId: string;
    customerPhone: string;
    senderType: string;
    content: string;
  }): Promise<BotMessage | null> {
    const conv = await this.conversationRepo.findOne({
      where: {
        tenantId: data.tenantId,
        customerPhone: data.customerPhone,
        status: 'active',
      },
    });
    if (!conv) return null;

    const msg = this.messageRepo.create({
      conversationId: conv.id,
      senderType: data.senderType,
      content: data.content,
    });
    const saved = await this.messageRepo.save(msg);
    conv.updatedAt = new Date();
    await this.conversationRepo.save(conv);
    return saved;
  }

  // --- Admin actions ---

  async reply(
    tenantId: string,
    conversationId: string,
    content: string,
    agentName: string,
  ): Promise<BotMessage> {
    const conv = await this.getConversation(tenantId, conversationId);
    if (conv.status !== 'active') {
      throw new BadRequestException('Conversation is not active');
    }

    // Send via WhatsApp
    await this.sendWhatsApp(conv.storeSlug, conv.customerPhone, content);

    // Save message
    const msg = this.messageRepo.create({
      conversationId: conv.id,
      senderType: 'agent',
      agentName,
      content,
    });
    const saved = await this.messageRepo.save(msg);
    conv.updatedAt = new Date();
    await this.conversationRepo.save(conv);
    return saved;
  }

  async closeConversation(tenantId: string, conversationId: string): Promise<BotConversation> {
    const conv = await this.getConversation(tenantId, conversationId);
    conv.status = 'closed';
    conv.closedAt = new Date();
    return this.conversationRepo.save(conv);
  }

  // --- Check if phone is in human mode ---

  async isHumanMode(tenantId: string, customerPhone: string): Promise<boolean> {
    const conv = await this.conversationRepo.findOne({
      where: {
        tenantId: tenantId,
        customerPhone,
        status: 'active',
      },
    });
    return !!conv;
  }

  async getActiveCount(tenantId: string): Promise<number> {
    return this.conversationRepo.count({
      where: { tenantId, status: 'active' },
    });
  }

  // --- WhatsApp send ---

  private async sendWhatsApp(storeSlug: string, toPhone: string, text: string): Promise<void> {
    const config = await this.botConfigRepo.findOne({ where: { storeSlug } });
    if (!config?.whatsappAccessToken || !config?.whatsappPhoneNumberId) {
      throw new BadRequestException(
        'WhatsApp credentials not configured for this store. Set whatsappAccessToken and whatsappPhoneNumberId in bot config.',
      );
    }

    const url = `${META_GRAPH_URL}/${config.whatsappPhoneNumberId}/messages`;
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: toPhone,
      type: 'text',
      text: { preview_url: true, body: text },
    };

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.whatsappAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const body = await resp.text();
      throw new BadRequestException(`WhatsApp send failed: ${resp.status} ${body}`);
    }
  }
}
