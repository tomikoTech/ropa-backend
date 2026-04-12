import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';

@Entity('bot_config')
@Unique(['storeSlug'])
export class BotConfig extends TenantAwareEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'store_slug', unique: true })
  storeSlug: string;

  @Column({ name: 'greeting_message', type: 'text', default: '' })
  greetingMessage: string;

  @Column({ name: 'about_response', type: 'text', default: '' })
  aboutResponse: string;

  @Column({ name: 'hours_response', type: 'text', default: '' })
  hoursResponse: string;

  @Column({ name: 'location_response', type: 'text', default: '' })
  locationResponse: string;

  @Column({ name: 'out_of_stock_message', type: 'text', default: 'Este producto existe pero está agotado. Revisalo acá y quedate pendiente para cuando llegue:' })
  outOfStockMessage: string;

  @Column({ name: 'menu_header', type: 'text', default: 'En qué te puedo ayudar?' })
  menuHeader: string;

  @Column({ name: 'btn_products_label', default: 'Buscar productos' })
  btnProductsLabel: string;

  @Column({ name: 'btn_about_label', default: 'Qué vendemos' })
  btnAboutLabel: string;

  @Column({ name: 'btn_hours_label', default: 'Horario y ubicación' })
  btnHoursLabel: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
