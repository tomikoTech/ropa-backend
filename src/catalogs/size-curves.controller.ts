import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { SizeCurvesService } from './size-curves.service.js';
import { SizeCurveTypesService } from './size-curve-types.service.js';
import {
  CreateSizeCurveDto,
  UpdateSizeCurveDto,
  CreateSizeCurveTypeDto,
  UpdateSizeCurveTypeDto,
} from './dto/size-curve.dto.js';
import { TenantId } from '../common/decorators/tenant-id.decorator.js';

@ApiTags('Catálogos - Curvas de tallas')
@ApiBearerAuth()
@Controller('size-curves')
export class SizeCurvesController {
  constructor(
    private readonly curves: SizeCurvesService,
    private readonly types: SizeCurveTypesService,
  ) {}

  // ── Familias ── (antes que /:id para que "types" no se lea como un id)

  @Get('types')
  @ApiOperation({ summary: 'Listar familias de curvas (con nº de curvas)' })
  findTypes(@TenantId() tenantId: string) {
    return this.types.findAll(tenantId);
  }

  @Post('types')
  @ApiOperation({ summary: 'Crear familia de curvas' })
  createType(
    @Body() dto: CreateSizeCurveTypeDto,
    @TenantId() tenantId: string,
  ) {
    return this.types.create(dto, tenantId);
  }

  @Patch('types/:id')
  @ApiOperation({ summary: 'Actualizar familia' })
  updateType(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSizeCurveTypeDto,
    @TenantId() tenantId: string,
  ) {
    return this.types.update(id, dto, tenantId);
  }

  @Delete('types/:id')
  @ApiOperation({ summary: 'Eliminar familia (sus curvas quedan sin familia)' })
  removeType(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantId() tenantId: string,
  ) {
    return this.types.remove(id, tenantId);
  }

  // ── Curvas ──

  @Get()
  @ApiOperation({ summary: 'Listar curvas con su detalle y total por caja' })
  findAll(@TenantId() tenantId: string) {
    return this.curves.findAll(tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener una curva' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantId() tenantId: string,
  ) {
    return this.curves.findOne(id, tenantId);
  }

  @Post()
  @ApiOperation({ summary: 'Crear curva de tallas' })
  create(@Body() dto: CreateSizeCurveDto, @TenantId() tenantId: string) {
    return this.curves.create(dto, tenantId);
  }

  @Post(':id/duplicate')
  @ApiOperation({ summary: 'Duplicar una curva con otro nombre' })
  duplicate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateSizeCurveTypeDto,
    @TenantId() tenantId: string,
  ) {
    return this.curves.duplicate(id, dto.name, tenantId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar curva (reemplaza el detalle)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSizeCurveDto,
    @TenantId() tenantId: string,
  ) {
    return this.curves.update(id, dto, tenantId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar curva' })
  remove(@Param('id', ParseUUIDPipe) id: string, @TenantId() tenantId: string) {
    return this.curves.remove(id, tenantId);
  }
}
