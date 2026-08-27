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
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { AccessService } from '../access/access.service.js';
import { Role } from '../common/enums/role.enum.js';
import { soloLoSuyo } from '../access/solo-lo-suyo.js';
import { MODULO_PANTALLA_SIMPLE } from '../access/pantalla-de-ventas.js';
import { MODULO_POS_TERCEROS } from '../access/pos-de-terceros.js';

@ApiTags('Ventas de Terceros')
@ApiBearerAuth()
@Controller('consignments')
export class ConsignmentsController {
  constructor(
    private readonly service: ConsignmentsService,
    private readonly access: AccessService,
  ) {}

  /**
   * A quién limitar lo que ve, o `null` para no limitarlo.
   *
   * La regla vive en `solo-lo-suyo.ts`; acá solo se resuelven los dos permisos
   * que esa regla mira. El filtro lo pone el servidor: mandar otro id a mano
   * no abre la puerta.
   */
  private async deQuien(user: {
    id: string;
    role: Role;
    accessRoleId: string | null;
  }): Promise<string | null> {
    const [simple, terceros] = await Promise.all([
      this.access.userCan(user, MODULO_PANTALLA_SIMPLE, 'list'),
      this.access.userCan(user, MODULO_POS_TERCEROS, 'list'),
    ]);
    return soloLoSuyo(
      (modulo) =>
        modulo === MODULO_PANTALLA_SIMPLE
          ? simple
          : modulo === MODULO_POS_TERCEROS
            ? terceros
            : false,
      user.id,
      {
        // `userCan` le dice que sí a todo a quien no tiene matriz.
        sinMatriz: !user.accessRoleId || user.role === Role.SUPER_ADMIN,
      },
    );
  }

  @Post()
  @ApiOperation({ summary: 'Registrar venta de tercero (consignación)' })
  create(
    @Body() dto: CreateConsignmentDto,
    @TenantId() tenantId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.create(dto, tenantId, user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Listar ventas de terceros (paginado)' })
  @ApiQuery({ name: 'thirdParty', required: false })
  @ApiQuery({ name: 'clientPaid', required: false })
  @ApiQuery({ name: 'supplierPaid', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  async findAll(
    @CurrentUser()
    user: { id: string; role: Role; accessRoleId: string | null },
    @TenantId() tenantId: string,
    @Query('thirdParty') thirdParty?: string,
    @Query('clientPaid') clientPaid?: string,
    @Query('supplierPaid') supplierPaid?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.findAllPaginado(tenantId, {
      userId: await this.deQuien(user),
      thirdParty: thirdParty || undefined,
      clientPaid: clientPaid === undefined ? undefined : clientPaid === 'true',
      supplierPaid:
        supplierPaid === undefined ? undefined : supplierPaid === 'true',
      page,
      limit,
      search,
      from,
      to,
    });
  }

  @Get('summary')
  @ApiOperation({ summary: 'Resumen: utilidad, por cobrar y por pagar' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  async summary(
    @CurrentUser()
    user: { id: string; role: Role; accessRoleId: string | null },
    @TenantId() tenantId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    // Su contabilidad, no la de la tienda: cuánto vendió, cuánto le costó y
    // cuánto ganó **él**. Con el mismo rango de fechas del listado, para que la
    // utilidad de arriba responda a "hoy"/"ayer" en vez de quedarse en el total
    // histórico.
    return this.service.summary(tenantId, await this.deQuien(user), from, to);
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
