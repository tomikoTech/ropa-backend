import { Global, Module } from '@nestjs/common';
import { RegistroDeTiempos } from './registro-de-tiempos.service.js';
import { LatenciaDeLaBase } from './latencia-de-la-base.service.js';
import { TiemposController } from './tiempos.controller.js';

/**
 * Global: el interceptor que mide se registra en `AppModule` y necesita el
 * registro; hacerlo global evita tener que importar este módulo en cada sitio.
 */
@Global()
@Module({
  controllers: [TiemposController],
  providers: [RegistroDeTiempos, LatenciaDeLaBase],
  exports: [RegistroDeTiempos, LatenciaDeLaBase],
})
export class ObservabilidadModule {}
