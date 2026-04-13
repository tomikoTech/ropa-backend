import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator.js';
import { TenantId } from '../common/decorators/tenant-id.decorator.js';
import { BotChatService } from './bot-chat.service.js';

// --- DTOs ---

class CreateConversationDto {
  tenantId: string;
  storeSlug: string;
  customerPhone: string;
  customerName?: string;
  escalationReason?: string;
  escalationSummary?: string;
  messages?: Array<{ senderType: string; content: string }>;
}

class AddMessageDto {
  tenantId: string;
  customerPhone: string;
  senderType: string;
  content: string;
}

class ReplyDto {
  content: string;
}

@ApiTags('Bot Chat')
@Controller()
export class BotChatController {
  constructor(private readonly chatService: BotChatService) {}

  // ── Admin endpoints (JWT protected) ──

  @Get('bot-conversations')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List active conversations' })
  async getConversations(
    @TenantId() tenantId: string,
    @Query('status') status?: string,
  ) {
    if (status === 'all') {
      return this.chatService.getAllConversations(tenantId);
    }
    return this.chatService.getActiveConversations(tenantId);
  }

  @Get('bot-conversations/count')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Count active conversations' })
  async getActiveCount(@TenantId() tenantId: string) {
    const count = await this.chatService.getActiveCount(tenantId);
    return { count };
  }

  @Get('bot-conversations/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get conversation with messages' })
  async getConversation(
    @TenantId() tenantId: string,
    @Param('id') id: string,
  ) {
    return this.chatService.getConversation(tenantId, id);
  }

  @Get('bot-conversations/:id/messages')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get messages for a conversation' })
  async getMessages(
    @TenantId() tenantId: string,
    @Param('id') id: string,
  ) {
    return this.chatService.getMessages(tenantId, id);
  }

  @Post('bot-conversations/:id/reply')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reply to conversation — sends WhatsApp message' })
  async reply(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: ReplyDto,
  ) {
    // Use tenant email as agent name (from JWT)
    return this.chatService.reply(tenantId, id, dto.content, 'Admin');
  }

  @Post('bot-conversations/:id/close')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Close conversation — returns customer to bot' })
  async close(
    @TenantId() tenantId: string,
    @Param('id') id: string,
  ) {
    return this.chatService.closeConversation(tenantId, id);
  }

  // ── Public endpoints (called by the bot) ──

  @Public()
  @Post('storefront/bot-chat/conversations')
  @ApiOperation({ summary: 'Create conversation (called by bot on escalation)' })
  async createConversation(@Body() dto: CreateConversationDto) {
    return this.chatService.createConversation(dto);
  }

  @Public()
  @Post('storefront/bot-chat/messages')
  @ApiOperation({ summary: 'Add message (called by bot for forwarding)' })
  async addMessage(@Body() dto: AddMessageDto) {
    return this.chatService.addMessage(dto);
  }

  @Public()
  @Get('storefront/bot-chat/human-mode')
  @ApiOperation({ summary: 'Check if phone is in human mode' })
  async checkHumanMode(
    @Query('tenantId') tenantId: string,
    @Query('phone') phone: string,
  ) {
    const isHuman = await this.chatService.isHumanMode(tenantId, phone);
    return { humanMode: isHuman };
  }
}
