import { Column, Index } from 'typeorm';

export abstract class TenantAwareEntity {
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  @Index()
  tenantId: string;
}
