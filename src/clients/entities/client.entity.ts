import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DocumentType } from '../../common/enums/document-type.enum.js';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';

@Entity('clients')
export class Client extends TenantAwareEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'first_name' })
  firstName: string;

  @Column({ name: 'last_name' })
  lastName: string;

  @Column({
    name: 'document_type',
    type: 'enum',
    enum: DocumentType,
    default: DocumentType.CC,
  })
  documentType: DocumentType;

  @Column({ name: 'document_number', nullable: true })
  documentNumber: string;

  @Column({ nullable: true })
  email: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  address: string;

  @Column({ name: 'is_generic', default: false })
  isGeneric: boolean;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
