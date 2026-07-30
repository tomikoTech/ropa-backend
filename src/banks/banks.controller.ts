import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { BanksService } from './banks.service.js';
import { CreateBankDto } from './dto/create-bank.dto.js';
import { UpdateBankDto } from './dto/update-bank.dto.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Role } from '../common/enums/role.enum.js';
import { TenantId } from '../common/decorators/tenant-id.decorator.js';

@ApiTags('Bancos')
@ApiBearerAuth()
@Controller('banks')
export class BanksController {
  constructor(private readonly banksService: BanksService) {}

  // Listar es visible para cualquier usuario (el POS necesita elegir banco).
  @Get()
  @ApiOperation({ summary: 'Listar bancos' })
  findAll(@TenantId() tenantId: string) {
    return this.banksService.findAll(tenantId);
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Crear banco' })
  create(@Body() dto: CreateBankDto, @TenantId() tenantId: string) {
    return this.banksService.create(dto, tenantId);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Actualizar banco' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBankDto,
    @TenantId() tenantId: string,
  ) {
    return this.banksService.update(id, dto, tenantId);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Eliminar banco' })
  remove(@Param('id', ParseUUIDPipe) id: string, @TenantId() tenantId: string) {
    return this.banksService.remove(id, tenantId);
  }
}
