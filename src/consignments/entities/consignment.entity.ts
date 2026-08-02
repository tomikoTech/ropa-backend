import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';

/**
 * Venta de terceros (consignación): registrar la venta de un producto que NO es
 * del inventario propio (p.ej. de un colega/hermano/otro local). Guarda costo y
 * precio para calcular utilidad, y el estado de pago hacia ambos lados:
 *   - clientPaid: ¿ya te pagó el cliente? (cuenta por cobrar mientras no)
 *   - supplierPaid: ¿ya le pagaste al tercero dueño? (cuenta por pagar mientras no)
 * Genérico y multi-tenant. No toca inventario propio ni las ventas del POS.
 */
@Entity('consignments')
export class Consignment extends TenantAwareEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Dueño del producto (el tercero): "Nico", "Ricardo"… (texto libre).
  @Column({ name: 'third_party_name' })
  thirdPartyName: string;

  // Qué se vendió (texto libre, no está en el inventario propio).
  @Column({ name: 'product_description' })
  productDescription: string;

  @Column({ nullable: true, default: '' })
  size: string;

  @Column({ nullable: true, default: '' })
  color: string;

  @Column({ type: 'int', default: 1 })
  quantity: number;

  // Costo unitario (lo que le debes al tercero por unidad).
  @Column({
    name: 'cost_price',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  costPrice: number;

  // Precio de venta unitario (lo que te paga el cliente).
  @Column({
    name: 'sale_price',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  salePrice: number;

  @Column({ name: 'client_name', nullable: true, default: '' })
  clientName: string;

  // ¿Ya te pagó el cliente? (mientras false => cuenta por cobrar)
  @Column({ name: 'client_paid', default: false })
  clientPaid: boolean;

  // ¿Ya le pagaste al tercero dueño? (mientras false => cuenta por pagar)
  @Column({ name: 'supplier_paid', default: false })
  supplierPaid: boolean;

  @Column({ name: 'payment_method', nullable: true, default: '' })
  paymentMethod: string;

  @Column({ name: 'sale_date', type: 'timestamptz' })
  saleDate: Date;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
