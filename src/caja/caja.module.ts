import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CajaController } from './caja.controller.js';
import { CajaService } from './caja.service.js';
import { CierreDeCaja } from './entities/cierre-de-caja.entity.js';
import { StoreSettings } from '../storefront/entities/store-settings.entity.js';

/**
 * Cuadre y cierre de caja.
 *
 * Exporta el servicio porque el POS y el inventario le preguntan dos cosas
 * antes de operar: si esta tienda exige comprobante para cobrar por
 * transferencia, y si el turno de quien está vendiendo sigue abierto.
 */
@Module({
  imports: [TypeOrmModule.forFeature([CierreDeCaja, StoreSettings])],
  controllers: [CajaController],
  providers: [CajaService],
  exports: [CajaService],
})
export class CajaModule {}
