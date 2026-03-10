import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ReturnsService } from './returns.service.js';
import { CreateReturnDto } from './dto/create-return.dto.js';
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
  @Roles(Role.ADMIN, Role.VENTAS)
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

  @Get(':id')
  @ApiOperation({ summary: 'Obtener devolución por ID' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantId() tenantId: string,
  ) {
    return this.returnsService.findOne(id, tenantId);
  }
}
