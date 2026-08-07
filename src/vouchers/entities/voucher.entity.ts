import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';

export enum VoucherStatus {
  ACTIVE = 'ACTIVE',
  REDEEMED = 'REDEEMED',
  DISABLED = 'DISABLED',
}

/**
 * Bono o cupón de regalo: un valor al portador que se descuenta en el POS.
 *
 * Se identifica por un código de barras propio para poder escanearlo igual
 * que un producto. A diferencia de una promoción, es de **un solo uso** y
 * tiene saldo: al canjearlo queda consumido.
 */
@Entity('vouchers')
@Unique(['tenantId', 'barcode'])
export class Voucher extends TenantAwareEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  barcode: string;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  amount: number;

  @Column({
    type: 'enum',
    enum: VoucherStatus,
    default: VoucherStatus.ACTIVE,
  })
  status: VoucherStatus;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @Column({ type: 'text', nullable: true })
  comment: string | null;

  /** Venta en la que se canjeó, para poder rastrearlo. */
  @Column({ name: 'redeemed_sale_id', type: 'uuid', nullable: true })
  redeemedSaleId: string | null;

  @Column({ name: 'redeemed_at', type: 'timestamptz', nullable: true })
  redeemedAt: Date | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdById: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
