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
import { LocationsService } from './locations.service.js';
import {
  CreateShelfDto,
  CreateStandDto,
  UpdateLocationDto,
} from './dto/location.dto.js';
import { TenantId } from '../common/decorators/tenant-id.decorator.js';

/**
 * Ubicaciones físicas: estanterías y stands dentro de una bodega.
 * Las rutas cuelgan de la bodega porque una estantería no existe fuera de ella.
 */
@ApiTags('Inventario - Ubicaciones')
@ApiBearerAuth()
@Controller('inventory')
export class LocationsController {
  constructor(private readonly locations: LocationsService) {}

  @Get('warehouses/:warehouseId/shelves')
  @ApiOperation({ summary: 'Estanterías de una bodega, con sus stands' })
  findByWarehouse(
    @Param('warehouseId', ParseUUIDPipe) warehouseId: string,
    @TenantId() tenantId: string,
  ) {
    return this.locations.findByWarehouse(warehouseId, tenantId);
  }

  @Post('warehouses/:warehouseId/shelves')
  @ApiOperation({ summary: 'Crear estantería' })
  createShelf(
    @Param('warehouseId', ParseUUIDPipe) warehouseId: string,
    @Body() dto: CreateShelfDto,
    @TenantId() tenantId: string,
  ) {
    return this.locations.createShelf(warehouseId, dto.name, tenantId);
  }

  @Patch('shelves/:id')
  @ApiOperation({ summary: 'Actualizar estantería' })
  updateShelf(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLocationDto,
    @TenantId() tenantId: string,
  ) {
    return this.locations.updateShelf(id, dto, tenantId);
  }

  @Delete('shelves/:id')
  @ApiOperation({ summary: 'Eliminar estantería (y sus stands)' })
  removeShelf(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantId() tenantId: string,
  ) {
    return this.locations.removeShelf(id, tenantId);
  }

  @Post('shelves/:shelfId/stands')
  @ApiOperation({ summary: 'Crear stand dentro de una estantería' })
  createStand(
    @Param('shelfId', ParseUUIDPipe) shelfId: string,
    @Body() dto: CreateStandDto,
    @TenantId() tenantId: string,
  ) {
    return this.locations.createStand(shelfId, dto.name, tenantId);
  }

  @Patch('stands/:id')
  @ApiOperation({ summary: 'Actualizar stand' })
  updateStand(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLocationDto,
    @TenantId() tenantId: string,
  ) {
    return this.locations.updateStand(id, dto, tenantId);
  }

  @Delete('stands/:id')
  @ApiOperation({ summary: 'Eliminar stand' })
  removeStand(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantId() tenantId: string,
  ) {
    return this.locations.removeStand(id, tenantId);
  }
}
