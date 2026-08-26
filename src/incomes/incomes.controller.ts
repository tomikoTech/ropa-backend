import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IncomesService } from './incomes.service.js';
import { CreateIncomeDto } from './dto/create-income.dto.js';
import { AdjustmentDto } from './dto/adjustment.dto.js';
import { TransferDto } from './dto/transfer.dto.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { TenantId } from '../common/decorators/tenant-id.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Role } from '../common/enums/role.enum.js';

@ApiTags('Ingresos')
@ApiBearerAuth()
@Controller('incomes')
export class IncomesController {
  constructor(private readonly incomesService: IncomesService) {}

  @Get('summary')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Resumen de ingresos y saldos por banco/método' })
  getSummary(
    @TenantId() tenantId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.incomesService.getSummary(tenantId, from, to);
  }

  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Listar movimientos manuales de tesorería' })
  list(
    @TenantId() tenantId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.incomesService.listEntriesPaginado(tenantId, {
      page,
      limit,
      search,
      from,
      to,
    });
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Registrar ingreso manual (OTROS)' })
  create(
    @Body() dto: CreateIncomeDto,
    @CurrentUser() user: { id: string },
    @TenantId() tenantId: string,
  ) {
    return this.incomesService.createIncome(dto, user.id, tenantId);
  }

  @Post('adjustment')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Ajustar saldo (sumar/restar) de un banco/método' })
  adjustment(
    @Body() dto: AdjustmentDto,
    @CurrentUser() user: { id: string },
    @TenantId() tenantId: string,
  ) {
    return this.incomesService.adjustment(dto, user.id, tenantId);
  }

  @Post('transfer')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Transferir plata entre banco/método' })
  transfer(
    @Body() dto: TransferDto,
    @CurrentUser() user: { id: string },
    @TenantId() tenantId: string,
  ) {
    return this.incomesService.transfer(dto, user.id, tenantId);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Eliminar movimiento manual' })
  remove(@Param('id', ParseUUIDPipe) id: string, @TenantId() tenantId: string) {
    return this.incomesService.remove(id, tenantId);
  }
}
