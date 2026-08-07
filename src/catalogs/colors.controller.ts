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
import { ColorsService } from './colors.service.js';
import { CreateColorDto } from './dto/create-color.dto.js';
import { UpdateColorDto } from './dto/update-color.dto.js';
import { TenantId } from '../common/decorators/tenant-id.decorator.js';

@ApiTags('Catálogos - Colores')
@ApiBearerAuth()
@Controller('colors')
export class ColorsController {
  constructor(private readonly colorsService: ColorsService) {}

  @Post()
  @ApiOperation({ summary: 'Crear color' })
  create(@Body() dto: CreateColorDto, @TenantId() tenantId: string) {
    return this.colorsService.create(dto, tenantId);
  }

  @Get()
  @ApiOperation({ summary: 'Listar colores (con uso)' })
  findAll(@TenantId() tenantId: string) {
    return this.colorsService.findAll(tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener color por ID' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantId() tenantId: string,
  ) {
    return this.colorsService.findOne(id, tenantId);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Actualizar color (renombra y sincroniza variantes)',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateColorDto,
    @TenantId() tenantId: string,
  ) {
    return this.colorsService.update(id, dto, tenantId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar color del catálogo' })
  remove(@Param('id', ParseUUIDPipe) id: string, @TenantId() tenantId: string) {
    return this.colorsService.remove(id, tenantId);
  }
}
