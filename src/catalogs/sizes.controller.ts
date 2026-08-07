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
import { SizesService } from './sizes.service.js';
import { CreateSizeDto } from './dto/create-size.dto.js';
import { UpdateSizeDto } from './dto/update-size.dto.js';
import { TenantId } from '../common/decorators/tenant-id.decorator.js';

@ApiTags('Catálogos - Tallas')
@ApiBearerAuth()
@Controller('sizes')
export class SizesController {
  constructor(private readonly sizesService: SizesService) {}

  @Post()
  @ApiOperation({ summary: 'Crear talla' })
  create(@Body() dto: CreateSizeDto, @TenantId() tenantId: string) {
    return this.sizesService.create(dto, tenantId);
  }

  @Get()
  @ApiOperation({ summary: 'Listar tallas en orden natural (con uso)' })
  findAll(@TenantId() tenantId: string) {
    return this.sizesService.findAll(tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener talla por ID' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantId() tenantId: string,
  ) {
    return this.sizesService.findOne(id, tenantId);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Actualizar talla (renombra y sincroniza variantes)',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSizeDto,
    @TenantId() tenantId: string,
  ) {
    return this.sizesService.update(id, dto, tenantId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar talla del catálogo' })
  remove(@Param('id', ParseUUIDPipe) id: string, @TenantId() tenantId: string) {
    return this.sizesService.remove(id, tenantId);
  }
}
