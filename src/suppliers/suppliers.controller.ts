import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { SuppliersService } from './suppliers.service.js';
import { CreateSupplierDto } from './dto/create-supplier.dto.js';
import { UpdateSupplierDto } from './dto/update-supplier.dto.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Role } from '../common/enums/role.enum.js';
import { TenantId } from '../common/decorators/tenant-id.decorator.js';

@ApiTags('Proveedores')
@ApiBearerAuth()
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Crear proveedor' })
  create(@Body() dto: CreateSupplierDto, @TenantId() tenantId: string) {
    return this.suppliersService.create(dto, tenantId);
  }

  @Get()
  @ApiOperation({ summary: 'Listar proveedores' })
  findAll(@TenantId() tenantId: string) {
    return this.suppliersService.findAll(tenantId);
  }

  @Get('search')
  @ApiOperation({ summary: 'Buscar proveedores' })
  search(@Query('q') query: string, @TenantId() tenantId: string) {
    return this.suppliersService.search(query || '', tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener proveedor por ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @TenantId() tenantId: string) {
    return this.suppliersService.findOne(id, tenantId);
  }

  @Put(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Actualizar proveedor' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSupplierDto,
    @TenantId() tenantId: string,
  ) {
    return this.suppliersService.update(id, dto, tenantId);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Eliminar proveedor' })
  remove(@Param('id', ParseUUIDPipe) id: string, @TenantId() tenantId: string) {
    return this.suppliersService.remove(id, tenantId);
  }
}
