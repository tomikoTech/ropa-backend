import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ExpensesService } from './expenses.service.js';
import {
  CreateExpenseDto,
  CreateExpenseCategoryDto,
  CreatePettyCashDto,
  FundPettyCashDto,
} from './dto/expense.dto.js';
import { TenantId } from '../common/decorators/tenant-id.decorator.js';
import { UserId } from '../common/decorators/user-id.decorator.js';

@ApiTags('Tesorería - Egresos')
@ApiBearerAuth()
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  // Las rutas fijas van antes que /:id para que no se lean como un id.

  @Get('categories')
  @ApiOperation({ summary: 'Listar tipos de gasto' })
  findCategories(@TenantId() tenantId: string) {
    return this.expenses.findCategories(tenantId);
  }

  @Post('categories')
  @ApiOperation({ summary: 'Crear tipo de gasto' })
  createCategory(
    @Body() dto: CreateExpenseCategoryDto,
    @TenantId() tenantId: string,
  ) {
    return this.expenses.createCategory(dto, tenantId);
  }

  @Delete('categories/:id')
  @ApiOperation({ summary: 'Eliminar tipo de gasto sin uso' })
  removeCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantId() tenantId: string,
  ) {
    return this.expenses.removeCategory(id, tenantId);
  }

  @Get('petty-cash')
  @ApiOperation({ summary: 'Cajas menores con su saldo' })
  findPettyCash(@TenantId() tenantId: string) {
    return this.expenses.findPettyCash(tenantId);
  }

  @Post('petty-cash')
  @ApiOperation({ summary: 'Crear caja menor' })
  createPettyCash(
    @Body() dto: CreatePettyCashDto,
    @TenantId() tenantId: string,
  ) {
    return this.expenses.createPettyCash(dto, tenantId);
  }

  @Post('petty-cash/:id/fund')
  @ApiOperation({ summary: 'Reponer el fondo de una caja menor' })
  fundPettyCash(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: FundPettyCashDto,
    @TenantId() tenantId: string,
  ) {
    return this.expenses.fundPettyCash(id, dto, tenantId);
  }

  @Get()
  @ApiOperation({ summary: 'Listar gastos con su total' })
  findAll(
    @TenantId() tenantId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('categoryId') categoryId?: string,
  ) {
    return this.expenses.findAll(tenantId, { from, to, categoryId });
  }

  @Post()
  @ApiOperation({ summary: 'Registrar un gasto' })
  create(
    @Body() dto: CreateExpenseDto,
    @UserId() userId: string,
    @TenantId() tenantId: string,
  ) {
    return this.expenses.create(dto, userId, tenantId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar un gasto' })
  remove(@Param('id', ParseUUIDPipe) id: string, @TenantId() tenantId: string) {
    return this.expenses.remove(id, tenantId);
  }
}
