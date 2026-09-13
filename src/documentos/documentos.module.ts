import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentosService } from './documentos.service.js';
import { DocumentosController } from './documentos.controller.js';
import { PosModule } from '../pos/pos.module.js';
import { UploadsModule } from '../uploads/uploads.module.js';
import { ConsignmentsModule } from '../consignments/consignments.module.js';
import { StoreSettings } from '../storefront/entities/store-settings.entity.js';
import { Tenant } from '../tenants/entities/tenant.entity.js';

/**
 * Los PDF que se le mandan al cliente: factura y estado de cuenta. Ver
 * `documentos.service.ts` para el porqué del enlace.
 */
@Module({
  imports: [PosModule, ConsignmentsModule, UploadsModule, TypeOrmModule.forFeature([StoreSettings, Tenant])],
  controllers: [DocumentosController],
  providers: [DocumentosService],
})
export class DocumentosModule {}
