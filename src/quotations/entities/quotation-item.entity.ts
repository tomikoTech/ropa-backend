import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';
import { Quotation } from './quotation.entity.js';

// Ítem de cotización (snapshot, igual que sale_items pero sin impacto en stock).
@Entity('quotation_items')
export class QuotationItem extends TenantAwareEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Quotation, (q) => q.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'quotation_id' })
  quotation: Quotation;

  @Column({ name: 'quotation_id' })
  quotationId: string;

  @Column({ name: 'variant_id', type: 'uuid' })
  variantId: string;

  @Column({ name: 'product_name' })
  productName: string;

  @Column({ name: 'variant_sku' })
  variantSku: string;

  @Column({ name: 'variant_size' })
  variantSize: string;

  @Column({ name: 'variant_color' })
  variantColor: string;

  @Column({ type: 'int' })
  quantity: number;

  @Column({ name: 'unit_price', type: 'decimal', precision: 12, scale: 2 })
  unitPrice: number;

  @Column({
    name: 'discount_percent',
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 0,
  })
  discountPercent: number;

  @Column({
    name: 'tax_rate',
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 19,
  })
  taxRate: number;

  @Column({ name: 'line_total', type: 'decimal', precision: 14, scale: 2 })
  lineTotal: number;
}
