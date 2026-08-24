import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { ConsignmentsService } from './consignments.service.js';
import { CreateConsignmentDto } from './dto/create-consignment.dto.js';
import { UpdateConsignmentDto } from './dto/update-consignment.dto.js';
import { TenantId } from '../common/decorators/tenant-id.decorator.js';

@ApiTags('Ventas de Terceros')
@ApiBearerAuth()
@Controller('consignments')
export class ConsignmentsController {
  constructor(private readonly service: ConsignmentsService) {}

  @Post()
  @ApiOperation({ summary: 'Registrar venta de tercero (consignación)' })
  create(@Body() dto: CreateConsignmentDto, @TenantId() tenantId: string) {
    return this.service.create(dto, tenantId);
  }

  @Get()
  @ApiOperation({ summary: 'Listar ventas de terceros' })
  @ApiQuery({ name: 'thirdParty', required: false })
  @ApiQuery({ name: 'clientPaid', required: false })
  @ApiQuery({ name: 'supplierPaid', required: false })
  findAll(
    @TenantId() tenantId: string,
    @Query('thirdParty') thirdParty?: string,
    @Query('clientPaid') clientPaid?: string,
    @Query('supplierPaid') supplierPaid?: string,
  ) {
    return this.service.findAll(tenantId, {
      thirdParty: thirdParty || undefined,
      clientPaid: clientPaid === undefined ? undefined : clientPaid === 'true',
      supplierPaid:
        supplierPaid === undefined ? undefined : supplierPaid === 'true',
    });
  }

  @Get('summary')
  @ApiOperation({ summary: 'Resumen: utilidad, por cobrar y por pagar' })
  summary(@TenantId() tenantId: string) {
    return this.service.summary(tenantId);
  }

  @Get('third-parties')
  @ApiOperation({ summary: 'Nombres de terceros (autocompletar)' })
  thirdParties(@TenantId() tenantId: string) {
    return this.service.thirdParties(tenantId);
  }

  @Get('productos')
  @ApiOperation({
    summary: 'La libreta: productos de tercero que ya se vendieron',
    description:
      'Se llena sola al registrar cada venta. No es inventario —no hay ' +
      'existencias ni bodega— sino lo que ya se vendio alguna vez, para no ' +
      'volver a escribirlo. Ordenada por lo que mas se vende.',
  })
  productos(
    @TenantId() tenantId: string,
    @Query('q') q?: string,
    @Query('thirdParty') thirdParty?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.productos(tenantId, {
      q,
      thirdParty,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener una venta de tercero' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantId() tenantId: string,
  ) {
    return this.service.findOne(id, tenantId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar venta de tercero' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateConsignmentDto,
    @TenantId() tenantId: string,
  ) {
    return this.service.update(id, dto, tenantId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar venta de tercero' })
  remove(@Param('id', ParseUUIDPipe) id: string, @TenantId() tenantId: string) {
    return this.service.remove(id, tenantId);
  }
}
