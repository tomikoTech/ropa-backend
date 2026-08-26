import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { QuotationsService } from './quotations.service.js';
import { CreateQuotationDto } from './dto/create-quotation.dto.js';
import { UpdateQuotationDto } from './dto/update-quotation.dto.js';
import { ConvertQuotationDto } from './dto/convert-quotation.dto.js';
import { RejectQuotationDto } from './dto/reject-quotation.dto.js';
import { AccessService } from '../access/access.service.js';
import { Role } from '../common/enums/role.enum.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { TenantId } from '../common/decorators/tenant-id.decorator.js';

@ApiTags('quotations')
@ApiBearerAuth()
@Controller('quotations')
export class QuotationsController {
  constructor(
    private readonly quotationsService: QuotationsService,
    private readonly access: AccessService,
  ) {}

  @Post()
  create(
    @Body() dto: CreateQuotationDto,
    @CurrentUser() user: { id: string },
    @TenantId() tenantId: string,
  ) {
    return this.quotationsService.create(dto, user.id, tenantId);
  }

  @Get()
  @ApiOperation({ summary: 'Listar cotizaciones / ventas por autorizar (paginado)' })
  async findAll(
    @CurrentUser()
    user: { id: string; role: Role; accessRoleId: string | null },
    @TenantId() tenantId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.quotationsService.findAllPaginado(
      tenantId,
      await this.quienMira(user),
      { page, limit },
    );
  }

  /**
   * Quién pregunta y si puede autorizar.
   *
   * Autorizar es `edit` sobre el módulo; crear es `create`. Un perfil con
   * «ver + crear» propone y no aprueba, y de ahí sale también qué se le lista.
   */
  private async quienMira(user: {
    id: string;
    role: Role;
    accessRoleId: string | null;
  }) {
    return {
      usuarioId: user.id,
      puedeAutorizar: await this.access.userCan(user, 'quotations', 'edit'),
    };
  }

  @Get('pendientes/conteo')
  @ApiOperation({
    summary: 'Cuántas ventas están esperando autorización (para el menú)',
    description:
      'Quien no puede autorizar cuenta solo las suyas, igual que en el listado.',
  })
  async contarPendientes(
    @CurrentUser()
    user: { id: string; role: Role; accessRoleId: string | null },
    @TenantId() tenantId: string,
  ) {
    return this.quotationsService.contarPendientes(
      tenantId,
      await this.quienMira(user),
    );
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser()
    user: { id: string; role: Role; accessRoleId: string | null },
    @TenantId() tenantId: string,
  ) {
    return this.quotationsService.findOne(
      id,
      tenantId,
      await this.quienMira(user),
    );
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateQuotationDto,
    @TenantId() tenantId: string,
  ) {
    return this.quotationsService.update(id, dto, tenantId);
  }

  @Post(':id/convert')
  convert(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConvertQuotationDto,
    @CurrentUser() user: { id: string },
    @TenantId() tenantId: string,
  ) {
    return this.quotationsService.convert(id, dto, user.id, tenantId);
  }

  @Post(':id/reject')
  @ApiOperation({
    summary: 'Decir «no» a una venta que espera autorización',
    description:
      'Solo quien puede autorizar: es un POST sobre algo que ya existe, así ' +
      'que el permiso que pide es «editar» cotizaciones — el mismo que impide ' +
      'que el vendedor se apruebe a sí mismo.',
  })
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectQuotationDto,
    @CurrentUser() user: { id: string },
    @TenantId() tenantId: string,
  ) {
    return this.quotationsService.reject(id, dto.reason, user.id, tenantId);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @TenantId() tenantId: string) {
    return this.quotationsService.remove(id, tenantId);
  }
}
