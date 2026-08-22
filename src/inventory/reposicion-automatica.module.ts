import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StoreSettings } from '../storefront/entities/store-settings.entity.js';
import { InternalRequest } from '../internal-requests/entities/internal-request.entity.js';
import { InternalRequestItem } from '../internal-requests/entities/internal-request-item.entity.js';
import { ReposicionAutomaticaService } from './reposicion-automatica.service.js';

/**
 * La reposición que se pide sola, en su propio módulo.
 *
 * Vive suelta porque quien la dispara es la venta —y mañana serán también el
 * traslado y la remisión de calle—, y ninguno de esos debería tener que
 * importar el módulo de inventario entero para avisar que un local se quedó
 * corto.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      StoreSettings,
      InternalRequest,
      InternalRequestItem,
    ]),
  ],
  providers: [ReposicionAutomaticaService],
  exports: [ReposicionAutomaticaService],
})
export class ReposicionAutomaticaModule {}
