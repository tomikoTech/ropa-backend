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
import { BrandsService } from './brands.service.js';
import { CreateBrandDto } from './dto/create-brand.dto.js';
import { UpdateBrandDto } from './dto/update-brand.dto.js';
import { TenantId } from '../common/decorators/tenant-id.decorator.js';

@ApiTags('Marcas')
@ApiBearerAuth()
@Controller('brands')
export class BrandsController {
  constructor(private readonly brandsService: BrandsService) {}

  @Post()
  @ApiOperation({ summary: 'Crear marca' })
  create(@Body() dto: CreateBrandDto, @TenantId() tenantId: string) {
    return this.brandsService.create(dto, tenantId);
  }

  @Get()
  @ApiOperation({ summary: 'Listar marcas (con conteo de productos)' })
  findAll(@TenantId() tenantId: string) {
    return this.brandsService.findAll(tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener marca por ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @TenantId() tenantId: string) {
    return this.brandsService.findOne(id, tenantId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar marca (renombra y sincroniza productos)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBrandDto,
    @TenantId() tenantId: string,
  ) {
    return this.brandsService.update(id, dto, tenantId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar marca (desvincula productos)' })
  remove(@Param('id', ParseUUIDPipe) id: string, @TenantId() tenantId: string) {
    return this.brandsService.remove(id, tenantId);
  }
}
