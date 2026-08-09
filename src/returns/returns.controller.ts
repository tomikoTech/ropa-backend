import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ReturnsService } from './returns.service.js';
import { CreateReturnDto } from './dto/create-return.dto.js';
import { RemitReturnDto } from './dto/remit-return.dto.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { TenantId } from '../common/decorators/tenant-id.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Role } from '../common/enums/role.enum.js';

@ApiTags('Devoluciones')
@ApiBearerAuth()
@Controller('returns')
export class ReturnsController {
  constructor(private readonly returnsService: ReturnsService) {}

  @Post()
  @Roles(Role.ADMIN, Role.COLABORADOR)
  @ApiOperation({ summary: 'Crear devolución' })
  create(
    @Body() dto: CreateReturnDto,
    @CurrentUser() user: { id: string },
    @TenantId() tenantId: string,
  ) {
    return this.returnsService.create(dto, user.id, tenantId);
  }

  @Get()
  @ApiOperation({ summary: 'Listar devoluciones' })
  findAll(@TenantId() tenantId: string) {
    return this.returnsService.findAll(tenantId);
  }

  @Get('credit-notes')
  @ApiOperation({ summary: 'Listar notas crédito' })
  findCreditNotes(@TenantId() tenantId: string) {
    return this.returnsService.findCreditNotes(tenantId);
  }

  @Get('sales/search')
  @ApiOperation({ summary: 'Buscar venta para cambio o devolución' })
  searchSale(@Query('q') query: string, @TenantId() tenantId: string) {
    return this.returnsService.searchSale(query, tenantId);
  }

  @Get('scan/:barcode')
  @ApiOperation({ summary: 'Resolver código físico para cambio o devolución' })
  scanBarcode(@Param('barcode') barcode: string, @TenantId() tenantId: string) {
    return this.returnsService.scanBarcode(barcode, tenantId);
  }

  @Post(':id/remit')
  @Roles(Role.ADMIN, Role.COLABORADOR)
  @ApiOperation({ summary: 'Remitir mercancía devuelta a otra bodega' })
  remit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RemitReturnDto,
    @CurrentUser() user: { id: string },
    @TenantId() tenantId: string,
  ) {
    return this.returnsService.remit(
      id,
      dto.destinationWarehouseId,
      user.id,
      tenantId,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener devolución por ID' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantId() tenantId: string,
  ) {
    return this.returnsService.findOne(id, tenantId);
  }
}
