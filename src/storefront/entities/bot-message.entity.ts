import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { BotConversation } from './bot-conversation.entity.js';

@Entity('bot_message')
export class BotMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'conversation_id', type: 'uuid' })
  conversationId: string;

  @ManyToOne(() => BotConversation, (c) => c.messages)
  @JoinColumn({ name: 'conversation_id' })
  conversation: BotConversation;

  @Column({ name: 'sender_type' })
  senderType: string; // 'customer' | 'bot' | 'agent'

  @Column({ name: 'agent_name', nullable: true })
  agentName: string;

  @Column({ type: 'text' })
  content: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
