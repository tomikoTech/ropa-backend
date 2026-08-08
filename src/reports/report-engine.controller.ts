import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import type { Response } from 'express';
import { ReportEngineService } from './report-engine.service.js';
import { writeReportFile, type ExportFormat } from './engine/report-export.js';
import { normalizeParams } from './engine/report-filters.js';
import { TenantId } from '../common/decorators/tenant-id.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Role } from '../common/enums/role.enum.js';

/**
 * Los seis reportes parametrizables (F9).
 *
 * Va en un controlador aparte del de reportes viejo **a propósito**: aquí sí se
 * aplica `RolesGuard`, y estos números (costos, utilidad, cartera) son de
 * administración. El controlador viejo no puede llevar el guard a nivel de
 * clase porque `/reports/dashboard` lo consume el home de cualquier usuario.
 */
@ApiTags('Reportes')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(Role.ADMIN)
@Controller('reports')
export class ReportEngineController {
  constructor(private readonly engine: ReportEngineService) {}

  @Get('catalog')
  @ApiOperation({
    summary: 'Reportes disponibles con sus filtros (y los que no se cubren)',
  })
  catalog() {
    return this.engine.catalog();
  }

  @Get('options')
  @ApiOperation({ summary: 'Catálogos para los filtros, en una sola llamada' })
  options(@TenantId() tenantId: string) {
    return this.engine.options(tenantId);
  }

  @Get('run/:key')
  @ApiOperation({ summary: 'Ejecuta un reporte: columnas, filas y totales' })
  run(
    @Param('key') key: string,
    @Query() query: Record<string, unknown>,
    @TenantId() tenantId: string,
  ) {
    return this.engine.run(key, query, tenantId);
  }

  @Get('run/:key/export')
  @ApiOperation({ summary: 'Exporta el mismo reporte a Excel o CSV' })
  async export(
    @Param('key') key: string,
    @Query() query: Record<string, unknown>,
    @TenantId() tenantId: string,
    @Res() res: Response,
  ) {
    const requested = query.format;
    const format =
      typeof requested === 'string' ? requested.toLowerCase() : 'xlsx';
    if (format !== 'xlsx' && format !== 'csv') {
      throw new BadRequestException(
        `Formato "${format}" no soportado. Usa xlsx o csv.`,
      );
    }

    const result = await this.engine.run(key, query, tenantId);
    // El archivo se arma con las mismas columnas y filas que la pantalla, así
    // que no pueden discrepar.
    await writeReportFile(
      res,
      result,
      format as ExportFormat,
      normalizeParams(query),
    );
  }
}
