import { Controller, Delete, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RegistroDeTiempos } from './registro-de-tiempos.service.js';
import { LatenciaDeLaBase } from './latencia-de-la-base.service.js';

/**
 * «¿Dónde se va el tiempo?», contestado con mediciones del propio servidor.
 *
 * Cuelga del módulo de Auditoría en la matriz de permisos: dice cuánto tarda
 * cada pantalla, que es información de administración, no de mostrador.
 */
@ApiTags('tiempos')
@ApiBearerAuth()
@Controller('tiempos')
export class TiemposController {
  constructor(
    private readonly registro: RegistroDeTiempos,
    private readonly latencia: LatenciaDeLaBase,
  ) {}

  @Get('base')
  @ApiOperation({
    summary: 'Cuánto tarda una consulta trivial en ir y volver de la base',
  })
  async idaYVueltaALaBase() {
    return this.latencia.medir();
  }

  @Get()
  @ApiOperation({
    summary: 'Cuánto tarda cada ruta en el servidor (p50, p95, máximo)',
  })
  resumen() {
    return this.registro.resumen();
  }

  @Delete()
  @ApiOperation({
    summary: 'Empezar a medir de nuevo (para comparar un antes y un después)',
  })
  reiniciar() {
    this.registro.reiniciar();
    return { ok: true };
  }
}
